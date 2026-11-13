import { db, issue, issueLink, monitoringRun, project, projectColumn } from '@repo/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { persistMonitoringResult } from './persistence';
import type { MonitoringScheduleSetting } from './scheduler';

export type MonitoringRule =
  'UNASSIGNED' | 'MISSING_DEADLINE' | 'DUE_SOON' | 'OVERDUE' | 'BLOCKED_DEPENDENCY';
export type MonitoringSeverity = 'high' | 'medium' | 'low';

export interface MonitoringIssue {
  id: number;
  title: string;
  stateType: string;
  assigneeUserId: string | null;
  dueDate: string | null;
}

export interface MonitoringLink {
  sourceIssueId: number;
  targetIssueId: number;
  kind: string;
}

export interface MonitoringFinding {
  key: string;
  projectId: number;
  issueId: number;
  rule: MonitoringRule;
  severity: MonitoringSeverity;
  explanation: string;
  evidence: string;
  nextAction: string;
}

export interface MonitoringResult {
  projectId: number;
  evaluatedAt: string;
  summary: {
    total: number;
    completed: number;
    active: number;
    findingsBySeverity: Record<string, number>;
    findingsByRule: Record<string, number>;
  };
  findings: MonitoringFinding[];
}

const severity: Record<MonitoringRule, MonitoringSeverity> = {
  UNASSIGNED: 'medium',
  MISSING_DEADLINE: 'medium',
  DUE_SOON: 'low',
  OVERDUE: 'high',
  BLOCKED_DEPENDENCY: 'high',
};

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return dateOnly(value);
}

function addFinding(
  findings: MonitoringFinding[],
  projectId: number,
  issueItem: MonitoringIssue,
  rule: MonitoringRule,
  explanation: string,
  evidence: string,
  nextAction: string,
) {
  findings.push({
    key: `${projectId}:${issueItem.id}:${rule}`,
    projectId,
    issueId: issueItem.id,
    rule,
    severity: severity[rule],
    explanation,
    evidence,
    nextAction,
  });
}

export function evaluateMonitoring(
  projectId: number,
  issues: MonitoringIssue[],
  links: MonitoringLink[],
  now: Date,
): MonitoringResult {
  const evaluatedAt = now.toISOString();
  const today = dateOnly(now);
  const dueSoonThrough = addDays(today, 3);
  const byId = new Map(issues.map((item) => [item.id, item]));
  const unfinishedPrerequisites = new Map<number, number[]>();

  for (const link of links) {
    if (link.kind !== 'blocks') continue;
    const prerequisite = byId.get(link.sourceIssueId);
    const dependent = byId.get(link.targetIssueId);
    if (
      prerequisite &&
      dependent &&
      prerequisite.stateType !== 'completed' &&
      prerequisite.stateType !== 'canceled'
    ) {
      const current = unfinishedPrerequisites.get(dependent.id) ?? [];
      current.push(prerequisite.id);
      unfinishedPrerequisites.set(dependent.id, current);
    }
  }

  const active = issues.filter(
    (item) => item.stateType !== 'completed' && item.stateType !== 'canceled',
  );
  const findings: MonitoringFinding[] = [];

  for (const item of active) {
    if (!item.assigneeUserId) {
      addFinding(
        findings,
        projectId,
        item,
        'UNASSIGNED',
        'This Work Item has no assignee.',
        'assigneeUserId is null',
        'Assign a project member or confirm that the item should remain unassigned.',
      );
    }
    if (!item.dueDate) {
      addFinding(
        findings,
        projectId,
        item,
        'MISSING_DEADLINE',
        'This Work Item has no committed due date.',
        'dueDate is null',
        'Set a committed due date after confirming the delivery expectation.',
      );
    } else if (item.dueDate < today) {
      addFinding(
        findings,
        projectId,
        item,
        'OVERDUE',
        'This Work Item is overdue.',
        `dueDate is ${item.dueDate}; evaluation date is ${today}`,
        'Update the plan or complete the overdue Work Item.',
      );
    } else if (item.dueDate <= dueSoonThrough) {
      addFinding(
        findings,
        projectId,
        item,
        'DUE_SOON',
        'This Work Item is due within the next 72 hours.',
        `dueDate is ${item.dueDate}; evaluation date is ${today}`,
        'Confirm the assignee and next step before the due date.',
      );
    }
    const prerequisites = unfinishedPrerequisites.get(item.id);
    if (prerequisites?.length) {
      addFinding(
        findings,
        projectId,
        item,
        'BLOCKED_DEPENDENCY',
        'This Work Item depends on unfinished prerequisites.',
        `unfinished blocking issue IDs: ${prerequisites.sort((a, b) => a - b).join(', ')}`,
        'Complete or unblock the prerequisite Work Items first.',
      );
    }
  }

  findings.sort((a, b) => a.key.localeCompare(b.key));
  const findingsBySeverity: Record<string, number> = {};
  const findingsByRule: Record<string, number> = {};
  for (const item of findings) {
    findingsBySeverity[item.severity] = (findingsBySeverity[item.severity] ?? 0) + 1;
    findingsByRule[item.rule] = (findingsByRule[item.rule] ?? 0) + 1;
  }

  return {
    projectId,
    evaluatedAt,
    summary: {
      total: issues.length,
      completed: issues.filter((item) => item.stateType === 'completed').length,
      active: active.length,
      findingsBySeverity,
      findingsByRule,
    },
    findings,
  };
}

export async function getProjectMonitoring(
  projectId: number,
  now: Date = new Date(),
): Promise<MonitoringResult> {
  const issues = await db
    .select({
      id: issue.id,
      title: issue.title,
      stateType: projectColumn.stateType,
      assigneeUserId: issue.assigneeUserId,
      dueDate: issue.dueDate,
    })
    .from(issue)
    .innerJoin(projectColumn, eq(projectColumn.id, issue.columnId))
    .where(eq(issue.projectId, projectId));
  const issueIds = issues.map((item) => item.id);
  const links =
    issueIds.length === 0
      ? []
      : await db
          .select({
            sourceIssueId: issueLink.sourceIssueId,
            targetIssueId: issueLink.targetIssueId,
            kind: issueLink.kind,
          })
          .from(issueLink)
          .where(
            and(
              eq(issueLink.kind, 'blocks'),
              inArray(issueLink.sourceIssueId, issueIds),
              inArray(issueLink.targetIssueId, issueIds),
            ),
          );
  return evaluateMonitoring(projectId, issues, links, now);
}

export async function runProjectMonitoring(
  projectId: number,
  now: Date = new Date(),
): Promise<
  MonitoringResult & {
    counts: { newAlerts: number; ongoingAlerts: number; resolvedAlerts: number };
  }
> {
  const completed = await runMonitoringTransaction(projectId, now);
  if (!completed) throw new Error('Monitoring evaluation did not complete');
  return completed;
}

export async function runScheduledProjectMonitoring(
  projectId: number,
  now: Date,
  schedule: MonitoringScheduleSetting,
): Promise<
  | (MonitoringResult & {
      counts: { newAlerts: number; ongoingAlerts: number; resolvedAlerts: number };
    })
  | null
> {
  return runMonitoringTransaction(
    projectId,
    now,
    (latestRunAt) => {
      if (!schedule.enabled) return false;
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: schedule.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        weekday: 'short',
        hourCycle: 'h23',
      }).formatToParts(now);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      if (Number(values.hour) < schedule.hour) return false;
      if (schedule.frequency === 'weekdays' && ['Sat', 'Sun'].includes(values.weekday))
        return false;
      if (!latestRunAt) return true;
      const latestParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: schedule.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(latestRunAt);
      const latestValues = Object.fromEntries(latestParts.map((part) => [part.type, part.value]));
      return (
        latestValues.year !== values.year ||
        latestValues.month !== values.month ||
        latestValues.day !== values.day
      );
    },
    false,
  );
}

async function runMonitoringTransaction(
  projectId: number,
  now: Date,
  shouldRun: ((latestRunAt: Date | null) => boolean) | undefined = undefined,
  throwWhenSkipped = true,
) {
  let evaluationError: unknown;
  const completed = await db.transaction(async (tx) => {
    await tx
      .select({ id: project.id })
      .from(project)
      .where(eq(project.id, projectId))
      .for('update');
    if (shouldRun) {
      const [latestRun] = await tx
        .select({ evaluatedAt: monitoringRun.evaluatedAt })
        .from(monitoringRun)
        .where(and(eq(monitoringRun.projectId, projectId), eq(monitoringRun.status, 'succeeded')))
        .orderBy(desc(monitoringRun.evaluatedAt))
        .limit(1);
      if (!shouldRun(latestRun?.evaluatedAt ?? null)) return null;
    }
    let result: MonitoringResult;
    try {
      result = await getProjectMonitoring(projectId, now);
    } catch (error) {
      evaluationError = error;
      await tx.insert(monitoringRun).values({
        projectId,
        evaluatedAt: Number.isNaN(now.getTime()) ? new Date() : now,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Monitoring evaluation failed',
      });
      return null;
    }
    const counts = await persistMonitoringResult(tx, result);
    return { ...result, counts };
  });
  if (evaluationError) throw evaluationError;
  if (!completed && throwWhenSkipped) throw new Error('Monitoring evaluation did not complete');
  return completed;
}
