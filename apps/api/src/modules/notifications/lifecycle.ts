import {
  db,
  issue,
  issueLink,
  notificationDelivery,
  project,
  projectColumn,
  projectMember,
  projectSetting,
  user,
} from '@repo/db';
import { alias } from 'drizzle-orm/pg-core';
import { and, eq, gte, inArray, isNull, like, sql } from 'drizzle-orm';
import { insertNotifications, type NewNotificationRow } from './service';
import { HttpError } from '#shared/lib';

export const TASK_LIFECYCLE_SETTING_KEY = 'task_lifecycle_notifications';

export interface TaskLifecycleSettings {
  enabled: boolean;
  reminderHours: number;
  escalationHours: number;
  enabledAt: string | null;
}

const DEFAULT_SETTINGS: TaskLifecycleSettings = {
  enabled: false,
  reminderHours: 24,
  escalationHours: 48,
  enabledAt: null,
};

export function normalizeTaskLifecycleSettings(value: unknown): TaskLifecycleSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS };
  const input = value as Record<string, unknown>;
  const reminderHours = validHours(input.reminderHours) ?? DEFAULT_SETTINGS.reminderHours;
  const escalationHours = validHours(input.escalationHours) ?? DEFAULT_SETTINGS.escalationHours;
  return {
    enabled: input.enabled === true,
    reminderHours,
    escalationHours:
      escalationHours > reminderHours
        ? escalationHours
        : Math.min(720, Math.max(DEFAULT_SETTINGS.escalationHours, reminderHours + 1)),
    enabledAt: typeof input.enabledAt === 'string' ? input.enabledAt : null,
  };
}

function validHours(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 720
    ? value
    : null;
}

export async function getTaskLifecycleSettings(projectId: number) {
  const [row] = await db
    .select({ value: projectSetting.value })
    .from(projectSetting)
    .where(
      and(
        eq(projectSetting.projectId, projectId),
        eq(projectSetting.key, TASK_LIFECYCLE_SETTING_KEY),
      ),
    );
  return normalizeTaskLifecycleSettings(row?.value);
}

export async function setTaskLifecycleSettings(
  projectId: number,
  input: Pick<TaskLifecycleSettings, 'enabled' | 'reminderHours' | 'escalationHours'>,
) {
  if (
    !Number.isInteger(input.reminderHours) ||
    input.reminderHours < 1 ||
    input.reminderHours > 720
  )
    throw new HttpError(400, 'Reminder threshold must be from 1 to 720 hours');
  if (
    !Number.isInteger(input.escalationHours) ||
    input.escalationHours <= input.reminderHours ||
    input.escalationHours > 720
  )
    throw new HttpError(
      400,
      'Escalation threshold must be later than the reminder and at most 720 hours',
    );

  const current = await getTaskLifecycleSettings(projectId);
  const value: TaskLifecycleSettings = {
    ...input,
    enabledAt: input.enabled ? (current.enabledAt ?? new Date().toISOString()) : null,
  };
  await db
    .insert(projectSetting)
    .values({ projectId, key: TASK_LIFECYCLE_SETTING_KEY, value })
    .onConflictDoUpdate({
      target: [projectSetting.projectId, projectSetting.key],
      set: { value, updatedAt: sql`now()` },
    });
  if (!value.enabled) {
    await db
      .update(issue)
      .set({ readyAt: null, readinessAssigneeUserId: null })
      .where(eq(issue.projectId, projectId));
    await db
      .delete(notificationDelivery)
      .where(
        and(
          eq(notificationDelivery.projectId, projectId),
          eq(notificationDelivery.status, 'pending'),
          like(notificationDelivery.dedupeKey, 'lifecycle:%'),
        ),
      );
  }
  return value;
}

async function dependencies(projectId: number) {
  const blocker = alias(issue, 'readiness_blocker');
  const blockerColumn = alias(projectColumn, 'readiness_blocker_column');
  return db
    .select({
      targetIssueId: issueLink.targetIssueId,
      blockerId: blocker.id,
      blockerSequence: blocker.sequenceNumber,
      blockerState: blockerColumn.stateType,
    })
    .from(issueLink)
    .innerJoin(blocker, eq(blocker.id, issueLink.sourceIssueId))
    .innerJoin(blockerColumn, eq(blockerColumn.id, blocker.columnId))
    .where(and(eq(issueLink.kind, 'blocks'), eq(blocker.projectId, projectId)));
}

async function cancelPendingLifecycleDeliveries(projectId: number, issueId: number) {
  await db
    .delete(notificationDelivery)
    .where(
      and(
        eq(notificationDelivery.projectId, projectId),
        eq(notificationDelivery.status, 'pending'),
        like(notificationDelivery.dedupeKey, `lifecycle:${issueId}:%`),
      ),
    );
}

export async function reconcileProjectReadiness(
  projectId: number,
  options: { notifyReady?: boolean; now?: Date } = {},
) {
  const settings = await getTaskLifecycleSettings(projectId);
  if (!settings.enabled || !settings.enabledAt) return;
  const now = options.now ?? new Date();
  const [rows, links, projectRows] = await Promise.all([
    db
      .select({
        id: issue.id,
        sequenceNumber: issue.sequenceNumber,
        title: issue.title,
        assigneeUserId: issue.assigneeUserId,
        memberUserId: projectMember.userId,
        createdAt: issue.createdAt,
        readyAt: issue.readyAt,
        readinessCycle: issue.readinessCycle,
        readinessAssigneeUserId: issue.readinessAssigneeUserId,
        stateType: projectColumn.stateType,
      })
      .from(issue)
      .innerJoin(projectColumn, eq(projectColumn.id, issue.columnId))
      .leftJoin(
        projectMember,
        and(
          eq(projectMember.projectId, issue.projectId),
          eq(projectMember.userId, issue.assigneeUserId),
        ),
      )
      .where(and(eq(issue.projectId, projectId), isNull(issue.archivedAt))),
    dependencies(projectId),
    db.select({ key: project.key }).from(project).where(eq(project.id, projectId)),
  ]);
  const projectKey = projectRows[0]?.key ?? '';
  const byTarget = new Map<number, typeof links>();
  for (const link of links) {
    const list = byTarget.get(link.targetIssueId) ?? [];
    list.push(link);
    byTarget.set(link.targetIssueId, list);
  }

  for (const row of rows) {
    const taskDependencies = byTarget.get(row.id) ?? [];
    const incomplete = taskDependencies.filter((link) => link.blockerState !== 'completed');
    const isUnstarted = row.stateType === 'backlog' || row.stateType === 'unstarted';
    const inAutomationWindow = row.createdAt >= new Date(settings.enabledAt);
    const eligible = isUnstarted && inAutomationWindow && incomplete.length === 0;
    const assigneeChanged = row.readinessAssigneeUserId !== row.assigneeUserId;

    if (!eligible) {
      if (row.readyAt) {
        await db
          .update(issue)
          .set({ readyAt: null, readinessAssigneeUserId: null })
          .where(eq(issue.id, row.id));
        await cancelPendingLifecycleDeliveries(projectId, row.id);
      }
      continue;
    }
    if (row.readyAt && !assigneeChanged) continue;
    if (assigneeChanged) await cancelPendingLifecycleDeliveries(projectId, row.id);

    const [updated] = await db
      .update(issue)
      .set({
        readyAt: now,
        readinessCycle: sql`${issue.readinessCycle} + 1`,
        readinessAssigneeUserId: row.assigneeUserId,
      })
      .where(
        and(
          eq(issue.id, row.id),
          row.readyAt ? eq(issue.readyAt, row.readyAt) : isNull(issue.readyAt),
        ),
      )
      .returning({ cycle: issue.readinessCycle });
    if (!updated || !row.memberUserId || !options.notifyReady || taskDependencies.length === 0)
      continue;

    const refs = taskDependencies.map((link) => `${projectKey}-${link.blockerSequence}`).join(', ');
    await insertNotifications([
      {
        userId: row.memberUserId,
        projectId,
        issueId: row.id,
        sourceActivityId: null,
        type: 'ready',
        actorUserId: null,
        message: `${refs} completed. ${projectKey}-${row.sequenceNumber} is now ready to start.`,
        dedupeKey: `lifecycle:${row.id}:${updated.cycle}:ready:${row.memberUserId}`,
      },
    ]);
  }
}

export async function assignmentReadinessMessage(issueId: number) {
  const blocker = alias(issue, 'assignment_blocker');
  const blockerColumn = alias(projectColumn, 'assignment_blocker_column');
  const [task, blockers] = await Promise.all([
    db
      .select({ key: project.key, sequence: issue.sequenceNumber, title: issue.title })
      .from(issue)
      .innerJoin(project, eq(project.id, issue.projectId))
      .where(eq(issue.id, issueId)),
    db
      .select({ key: project.key, sequence: blocker.sequenceNumber })
      .from(issueLink)
      .innerJoin(blocker, eq(blocker.id, issueLink.sourceIssueId))
      .innerJoin(blockerColumn, eq(blockerColumn.id, blocker.columnId))
      .innerJoin(project, eq(project.id, blocker.projectId))
      .where(
        and(
          eq(issueLink.targetIssueId, issueId),
          eq(issueLink.kind, 'blocks'),
          sql`${blockerColumn.stateType} <> 'completed'`,
        ),
      ),
  ]);
  const row = task[0];
  if (!row) return null;
  const ref = `${row.key}-${row.sequence}`;
  if (blockers.length === 0)
    return `You were assigned ${ref} – ${row.title}. It is ready to start.`;
  const refs = blockers.map((item) => `${item.key}-${item.sequence}`).join(', ');
  return `You were assigned ${ref} – ${row.title}. Waiting for ${refs} to finish.`;
}

export async function notifyPublishedAssignments(
  projectId: number,
  issueIds: number[],
  actorUserId: string,
  receiptId: number,
) {
  if (issueIds.length === 0) return;
  const assigned = await db
    .select({ issueId: issue.id, userId: issue.assigneeUserId })
    .from(issue)
    .innerJoin(
      projectMember,
      and(eq(projectMember.projectId, projectId), eq(projectMember.userId, issue.assigneeUserId)),
    )
    .where(and(eq(issue.projectId, projectId), inArray(issue.id, issueIds)));
  const rows: NewNotificationRow[] = [];
  for (const item of assigned) {
    if (!item.userId) continue;
    rows.push({
      userId: item.userId,
      projectId,
      issueId: item.issueId,
      sourceActivityId: null,
      type: 'assigned',
      actorUserId,
      message: await assignmentReadinessMessage(item.issueId),
      dedupeKey: `planning-launch:${receiptId}:assigned:${item.issueId}:${item.userId}`,
    });
  }
  await insertNotifications(rows);
}

export async function runTaskLifecycleNotifications(now: Date = new Date()) {
  const settingsRows = await db
    .select({ projectId: projectSetting.projectId, value: projectSetting.value })
    .from(projectSetting)
    .where(
      and(
        eq(projectSetting.key, TASK_LIFECYCLE_SETTING_KEY),
        sql`${projectSetting.value}->>'enabled' = 'true'`,
      ),
    );
  for (const settingRow of settingsRows) {
    const settings = normalizeTaskLifecycleSettings(settingRow.value);
    if (!settings.enabledAt) continue;
    await reconcileProjectReadiness(settingRow.projectId, { notifyReady: true, now });
    const tasks = await db
      .select({
        id: issue.id,
        sequence: issue.sequenceNumber,
        title: issue.title,
        assigneeUserId: issue.assigneeUserId,
        assigneeName: user.name,
        readyAt: issue.readyAt,
        cycle: issue.readinessCycle,
      })
      .from(issue)
      .innerJoin(projectColumn, eq(projectColumn.id, issue.columnId))
      .innerJoin(
        projectMember,
        and(
          eq(projectMember.projectId, issue.projectId),
          eq(projectMember.userId, issue.assigneeUserId),
        ),
      )
      .innerJoin(user, eq(user.id, issue.assigneeUserId))
      .where(
        and(
          eq(issue.projectId, settingRow.projectId),
          isNull(issue.archivedAt),
          inArray(projectColumn.stateType, ['backlog', 'unstarted']),
          gte(issue.readyAt, new Date(settings.enabledAt)),
        ),
      );
    const owners = await db
      .select({ userId: projectMember.userId })
      .from(projectMember)
      .where(
        and(eq(projectMember.projectId, settingRow.projectId), eq(projectMember.role, 'owner')),
      );
    for (const task of tasks) {
      if (!task.readyAt || !task.assigneeUserId) continue;
      const waitingHours = Math.floor((now.getTime() - task.readyAt.getTime()) / 3_600_000);
      const rows: NewNotificationRow[] = [];
      if (waitingHours >= settings.reminderHours) {
        rows.push({
          userId: task.assigneeUserId,
          projectId: settingRow.projectId,
          issueId: task.id,
          sourceActivityId: null,
          type: 'reminder',
          actorUserId: null,
          message: `This task has been ready for ${waitingHours} hours. Do you need help getting started?`,
          dedupeKey: `lifecycle:${task.id}:${task.cycle}:reminder:${task.assigneeUserId}`,
        });
      }
      if (waitingHours >= settings.escalationHours) {
        for (const owner of owners) {
          rows.push({
            userId: owner.userId,
            projectId: settingRow.projectId,
            issueId: task.id,
            sourceActivityId: null,
            type: 'escalation',
            actorUserId: null,
            message: `${task.title} has not started ${waitingHours} hours after becoming ready. Assignee: ${task.assigneeName}. Review blockers or reassignment.`,
            dedupeKey: `lifecycle:${task.id}:${task.cycle}:escalation:${owner.userId}`,
          });
        }
      }
      await insertNotifications(rows);
    }
  }
}
