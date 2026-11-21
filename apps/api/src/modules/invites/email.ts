import { randomUUID } from 'node:crypto';
import {
  db,
  emailSource,
  getDeliveryConfig,
  getInstanceEmailConfig,
  notificationDelivery,
  team,
} from '@repo/db';
import { composeEmail, savedLocaleOf, trustedOrigins } from '@repo/auth';
import {
  DEFAULT_LOCALE,
  emailWords,
  hasEmailProvider,
  sendEmail,
  type EmailConfig,
  type EmailWords,
  type Locale,
} from '@repo/mailer';
import { and, eq, sql } from 'drizzle-orm';
import type { InviteRow } from './service';

interface InviteProject {
  id: number;
  name: string;
  teamId: number;
}

async function inviteEmailProvider(
  teamId: number,
): Promise<{ config: EmailConfig; source: 'project' | 'instance' } | null> {
  const teamConfig = await getDeliveryConfig(teamId);
  const source = emailSource(teamConfig);
  if (source === 'smtp' || source === 'resend') {
    const config: EmailConfig = {
      smtp: teamConfig.smtp,
      resend: teamConfig.resend,
      from: teamConfig.from,
    };
    return hasEmailProvider(config) ? { config, source: 'project' } : null;
  }
  if (source !== 'system') return null;
  const config = await getInstanceEmailConfig();
  return config && hasEmailProvider(config) ? { config, source: 'instance' } : null;
}

export async function hasInviteEmailProvider(teamId: number): Promise<boolean> {
  return (await inviteEmailProvider(teamId)) !== null;
}

async function inviteLocale(invite: InviteRow): Promise<Locale> {
  const invited = await savedLocaleOf(invite.email);
  if (invited) return invited;
  const sender = invite.invitedByEmail ? await savedLocaleOf(invite.invitedByEmail) : null;
  return sender ?? DEFAULT_LOCALE;
}

function inviterName(invite: InviteRow, words: EmailWords): string {
  return invite.invitedByName ?? invite.invitedByEmail ?? words.someone;
}

// Serializes enqueue attempts for one invite across API replicas. Without this,
// two clicks arriving together can both observe an empty outbox and insert the
// same email before either transaction commits.
const INVITE_EMAIL_LOCK_NAMESPACE = 8242;

export async function enqueueInviteEmail(
  project: InviteProject,
  invite: InviteRow,
): Promise<boolean> {
  const provider = await inviteEmailProvider(project.teamId);
  if (!provider) return false;

  const dedupeKey = `project-invite:${invite.id}`;
  const locale = await inviteLocale(invite);
  const words = emailWords(locale);
  const url = new URL(`/invite/${invite.token}`, trustedOrigins[0]).toString();
  const email = await composeEmail(
    'inviteProject',
    locale,
    {
      inviter: inviterName(invite, words),
      project: project.name,
      role: invite.role === 'owner' ? words.owner : (invite.roleName ?? words.member),
    },
    url,
  );

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${INVITE_EMAIL_LOCK_NAMESPACE}, ${invite.id})`,
    );
    const [pending] = await tx
      .select({ id: notificationDelivery.id })
      .from(notificationDelivery)
      .where(
        and(
          eq(notificationDelivery.projectId, project.id),
          eq(notificationDelivery.channel, 'email'),
          eq(notificationDelivery.recipient, invite.email),
          eq(notificationDelivery.status, 'pending'),
          sql`${notificationDelivery.payload}->>'dedupeKey' = ${dedupeKey}`,
        ),
      )
      .limit(1);
    if (pending) return;

    await tx.insert(notificationDelivery).values({
      projectId: project.id,
      channel: 'email',
      recipient: invite.email,
      payload: {
        ...email,
        url,
        emailSource: provider.source,
        idempotencyKey: `project-invite/${invite.id}/${randomUUID()}`,
        dedupeKey,
        projectInviteId: invite.id,
      },
    });
  });
  return true;
}

// A team invite names no project, and the notification outbox belongs to one, so it
// cannot be queued there. It is sent at once instead, as the sign-in emails are:
// best effort, without the outbox's retries. A failure leaves the link to be copied.
export async function sendTeamInviteEmail(teamId: number, invite: InviteRow): Promise<boolean> {
  const provider = await inviteEmailProvider(teamId);
  if (!provider) return false;

  const [row] = await db.select({ name: team.name }).from(team).where(eq(team.id, teamId));
  const locale = await inviteLocale(invite);
  const words = emailWords(locale);
  const email = await composeEmail(
    'inviteTeam',
    locale,
    {
      inviter: inviterName(invite, words),
      team: row?.name ?? words.untitled,
      role: words[invite.teamRole],
    },
    `${trustedOrigins[0]}/invite/${invite.token}`,
  );
  const result = await sendEmail(provider.config, { to: invite.email, ...email });
  if (!result.ok) console.error('[invites] team invite email failed');
  return result.ok;
}
