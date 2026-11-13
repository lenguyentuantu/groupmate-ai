import { db, issue, monitoringAlert, projectMember, notification } from '@repo/db';
import { enqueueOutbound } from '#modules/notifications/outbound';
import { and, desc, eq, inArray, isNotNull, like } from 'drizzle-orm';
import type { MonitoringResult } from './service';

type PreviousAlert = {
  findingKey: string;
  severity: string;
  status: string;
};

const severityRank = { low: 1, medium: 2, high: 3 } as const;
const FOLLOW_UP_DAYS = 3;

export type MonitoringReminderStage =
  'due-72h' | 'due-24h' | 'overdue-initial' | 'overdue-follow-up';
type SentMonitoringReminder = {
  stage: MonitoringReminderStage | null;
  createdAt: Date;
};

export function monitoringReminderStage(
  rule: MonitoringResult['findings'][number]['rule'],
  dueDate: string | null,
  evaluatedAt: Date,
): MonitoringReminderStage | null {
  if (!dueDate || (rule !== 'DUE_SOON' && rule !== 'OVERDUE')) return null;
  const today = evaluatedAt.toISOString().slice(0, 10);
  if (rule === 'OVERDUE' || dueDate < today) return 'overdue-initial';
  const daysUntilDue = Math.round(
    (Date.parse(`${dueDate}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) /
      (24 * 60 * 60 * 1000),
  );
  return daysUntilDue <= 1 ? 'due-24h' : 'due-72h';
}

export function shouldNotifyMonitoringFinding(
  currentSeverity: keyof typeof severityRank,
  previous: PreviousAlert | undefined,
): boolean {
  return (
    !previous ||
    previous.status === 'resolved' ||
    severityRank[currentSeverity] > severityRank[previous.severity as keyof typeof severityRank]
  );
}

export async function notifyMonitoringResult(
  result: MonitoringResult,
  previousAlerts: PreviousAlert[],
  firstRun: boolean,
): Promise<number> {
  if (result.findings.length === 0) return 0;
  const alertRows = await db
    .select({
      findingKey: monitoringAlert.findingKey,
      firstSeenAt: monitoringAlert.firstSeenAt,
      severity: monitoringAlert.severity,
      status: monitoringAlert.status,
    })
    .from(monitoringAlert)
    .where(
      and(eq(monitoringAlert.projectId, result.projectId), eq(monitoringAlert.status, 'active')),
    );
  const activeByKey = new Map(alertRows.map((row) => [row.findingKey, row]));
  const current = result.findings.filter((finding) => {
    const alert = activeByKey.get(finding.key);
    const previous = previousAlerts.find((item) => item.findingKey === finding.key);
    return (
      alert != null &&
      (firstRun ||
        finding.rule === 'DUE_SOON' ||
        finding.rule === 'OVERDUE' ||
        shouldNotifyMonitoringFinding(finding.severity, previous))
    );
  });
  if (current.length === 0) return 0;

  const issueIds = [...new Set(current.map((finding) => finding.issueId))];
  const issues = await db
    .select({ id: issue.id, assigneeUserId: issue.assigneeUserId, dueDate: issue.dueDate })
    .from(issue)
    .where(and(eq(issue.projectId, result.projectId), inArray(issue.id, issueIds)));
  const assigneeByIssue = new Map(issues.map((item) => [item.id, item.assigneeUserId]));
  const members = await db
    .select({ userId: projectMember.userId, role: projectMember.role })
    .from(projectMember)
    .where(eq(projectMember.projectId, result.projectId));
  const memberIds = new Set(members.map((member) => member.userId));
  const ownerIds = members
    .filter((member) => member.role === 'owner')
    .map((member) => member.userId);
  const evaluatedAt = new Date(result.evaluatedAt);
  const previousNotifications = await db
    .select({
      issueId: notification.issueId,
      dedupeKey: notification.dedupeKey,
      createdAt: notification.createdAt,
    })
    .from(notification)
    .where(
      and(
        eq(notification.projectId, result.projectId),
        eq(notification.type, 'monitoring'),
        isNotNull(notification.dedupeKey),
        inArray(notification.issueId, issueIds),
        like(notification.dedupeKey, 'monitoring:%'),
      ),
    )
    .orderBy(desc(notification.createdAt));
  const notificationsByEpisode = new Map<string, SentMonitoringReminder[]>();
  const stages = new Set<MonitoringReminderStage>([
    'due-72h',
    'due-24h',
    'overdue-initial',
    'overdue-follow-up',
  ]);
  for (const previous of previousNotifications) {
    if (!previous.issueId || !previous.dedupeKey) continue;
    const parsed = parseMonitoringReminderKey(previous.dedupeKey, stages);
    const stage = parsed?.stage ?? null;
    const episode = parsed?.episode ?? previous.dedupeKey;
    const entries = notificationsByEpisode.get(episode) ?? [];
    entries.push({ stage, createdAt: previous.createdAt });
    notificationsByEpisode.set(episode, entries);
  }
  const dueDateByIssue = new Map(issues.map((item) => [item.id, item.dueDate]));
  const rows: Array<typeof notification.$inferInsert> = [];

  if (firstRun) {
    const issueId = current[0].issueId;
    const key = current
      .map((finding) => finding.key)
      .sort()
      .map(
        (findingKey) => `${findingKey}:${activeByKey.get(findingKey)?.firstSeenAt.toISOString()}`,
      )
      .join('|');
    for (const userId of ownerIds) {
      rows.push({
        userId,
        projectId: result.projectId,
        issueId,
        type: 'monitoring',
        actorUserId: null,
        message: `Monitoring found ${current.length} actionable Work Item finding(s). Review the project monitoring results.`,
        dedupeKey: `monitoring:summary:${result.projectId}:${key}`,
      });
    }
  } else {
    for (const finding of current) {
      const recipients =
        finding.rule === 'UNASSIGNED' || finding.rule === 'MISSING_DEADLINE'
          ? ownerIds
          : [assigneeByIssue.get(finding.issueId)].filter(
              (userId): userId is string => userId != null && memberIds.has(userId),
            );
      const firstSeenAt = activeByKey.get(finding.key)?.firstSeenAt;
      if (!firstSeenAt) continue;
      const baseStage = monitoringReminderStage(
        finding.rule,
        dueDateByIssue.get(finding.issueId) ?? null,
        evaluatedAt,
      );
      const reminderStage = baseStage
        ? nextMonitoringReminderStage(
            baseStage,
            `monitoring:${finding.key}:${firstSeenAt.toISOString()}`,
            notificationsByEpisode,
            evaluatedAt,
          )
        : 'finding';
      if (reminderStage === null) {
        continue;
      }
      for (const userId of recipients) {
        rows.push({
          userId,
          projectId: result.projectId,
          issueId: finding.issueId,
          type: 'monitoring',
          actorUserId: null,
          message: `${finding.rule}: ${finding.explanation} ${finding.nextAction}`,
          dedupeKey: `monitoring:${finding.key}:${firstSeenAt.toISOString()}:${
            reminderStage === 'finding' ? 'finding' : stageKey(reminderStage, evaluatedAt)
          }`,
        });
      }
    }
  }
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(notification)
    .values(rows)
    .onConflictDoNothing({
      target: [
        notification.userId,
        notification.projectId,
        notification.type,
        notification.dedupeKey,
      ],
    })
    .returning({ id: notification.id });
  const outboundResults = await Promise.allSettled(
    rows.map((row) =>
      enqueueOutbound(
        [
          {
            userId: row.userId,
            projectId: row.projectId,
            issueId: row.issueId ?? null,
            sourceActivityId: null,
            type: 'monitoring',
            actorUserId: row.actorUserId ?? null,
            message: row.message,
            dedupeKey: row.dedupeKey,
          },
        ],
        null,
        null,
      ),
    ),
  );
  for (const result of outboundResults) {
    if (result.status === 'rejected') {
      console.error('[monitoring] outbound notification enqueue failed:', result.reason);
    }
  }
  return inserted.length;
}

export function nextMonitoringReminderStage(
  stage: MonitoringReminderStage,
  episodeKey: string,
  notificationsByEpisode: Map<string, SentMonitoringReminder[]>,
  evaluatedAt: Date,
): MonitoringReminderStage | null {
  const sent = notificationsByEpisode.get(episodeKey) ?? [];
  const hasStage = (candidate: MonitoringReminderStage) =>
    sent.some(
      (item) => item.stage === candidate || (candidate === 'due-72h' && item.stage == null),
    );
  if (stage === 'due-72h' || stage === 'due-24h') {
    return hasStage(stage) ? null : stage;
  }

  const lastOverdue = sent
    .filter((item) => item.stage === 'overdue-initial' || item.stage === 'overdue-follow-up')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!lastOverdue) return 'overdue-initial';
  return evaluatedAt.getTime() - lastOverdue.createdAt.getTime() >= FOLLOW_UP_DAYS * 86400000
    ? 'overdue-follow-up'
    : null;
}

function stageKey(stage: MonitoringReminderStage, evaluatedAt: Date): string {
  if (stage !== 'overdue-follow-up') return stage;
  return `${stage}-${Math.floor(evaluatedAt.getTime() / (FOLLOW_UP_DAYS * 86400000))}`;
}

function parseMonitoringReminderKey(
  key: string,
  stages: Set<MonitoringReminderStage>,
): { episode: string; stage: MonitoringReminderStage } | null {
  for (const stage of stages) {
    const suffix = `:${stage}`;
    if (key.endsWith(suffix)) {
      return { episode: key.slice(0, -suffix.length), stage };
    }
  }
  const marker = ':overdue-follow-up:';
  const markerIndex = key.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return { episode: key.slice(0, markerIndex), stage: 'overdue-follow-up' };
  }
  return null;
}
