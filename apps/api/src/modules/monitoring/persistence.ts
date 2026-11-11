import { db, monitoringAlert, monitoringRun, project } from '@repo/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { MonitoringFinding, MonitoringResult } from './service';

type MonitoringTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface MonitoringRunCounts {
  newAlerts: number;
  ongoingAlerts: number;
  resolvedAlerts: number;
}

export interface ExistingMonitoringAlert {
  findingKey: string;
  status: string;
}

export function calculateAlertChanges(
  existing: ExistingMonitoringAlert[],
  findings: MonitoringFinding[],
): MonitoringRunCounts {
  const existingByKey = new Map(existing.map((alert) => [alert.findingKey, alert]));
  let newAlerts = 0;
  let ongoingAlerts = 0;
  for (const finding of findings) {
    const current = existingByKey.get(finding.key);
    if (!current || current.status === 'resolved') newAlerts++;
    else ongoingAlerts++;
  }
  const findingKeys = new Set(findings.map((finding) => finding.key));
  const resolvedAlerts = existing.filter(
    (alert) => alert.status === 'active' && !findingKeys.has(alert.findingKey),
  ).length;
  return { newAlerts, ongoingAlerts, resolvedAlerts };
}

export async function persistMonitoringResult(
  tx: MonitoringTx,
  result: MonitoringResult,
): Promise<MonitoringRunCounts> {
  const evaluatedAt = new Date(result.evaluatedAt);
  const findingKeys = result.findings.map((finding) => finding.key);
  await tx
    .select({ id: project.id })
    .from(project)
    .where(eq(project.id, result.projectId))
    .for('update');
  const existing = await tx
    .select({
      findingKey: monitoringAlert.findingKey,
      status: monitoringAlert.status,
    })
    .from(monitoringAlert)
    .where(eq(monitoringAlert.projectId, result.projectId))
    .for('update');
  const [latestRun] = await tx
    .select({ evaluatedAt: monitoringRun.evaluatedAt })
    .from(monitoringRun)
    .where(
      and(eq(monitoringRun.projectId, result.projectId), eq(monitoringRun.status, 'succeeded')),
    )
    .orderBy(desc(monitoringRun.evaluatedAt))
    .limit(1);
  if (latestRun && latestRun.evaluatedAt >= evaluatedAt) {
    const counts = { newAlerts: 0, ongoingAlerts: 0, resolvedAlerts: 0 };
    await tx.insert(monitoringRun).values({
      projectId: result.projectId,
      evaluatedAt,
      status: 'succeeded',
      totalFindings: result.findings.length,
      ...counts,
    });
    return counts;
  }
  const counts = calculateAlertChanges(existing, result.findings);

  for (const finding of result.findings) {
    await tx
      .insert(monitoringAlert)
      .values(alertValues(result.projectId, finding, evaluatedAt))
      .onConflictDoUpdate({
        target: [monitoringAlert.projectId, monitoringAlert.findingKey],
        set: {
          issueId: finding.issueId,
          rule: finding.rule,
          severity: finding.severity,
          evidence: finding.evidence,
          explanation: finding.explanation,
          nextAction: finding.nextAction,
          lastSeenAt: evaluatedAt,
          resolvedAt: null,
          status: 'active',
        },
      });
  }

  const missing = existing.filter(
    (alert) => alert.status === 'active' && !findingKeys.includes(alert.findingKey),
  );
  if (missing.length > 0) {
    await tx
      .update(monitoringAlert)
      .set({ status: 'resolved', resolvedAt: evaluatedAt })
      .where(
        and(
          eq(monitoringAlert.projectId, result.projectId),
          eq(monitoringAlert.status, 'active'),
          inArray(
            monitoringAlert.findingKey,
            missing.map((alert) => alert.findingKey),
          ),
        ),
      );
  }

  await tx.insert(monitoringRun).values({
    projectId: result.projectId,
    evaluatedAt,
    status: 'succeeded',
    totalFindings: result.findings.length,
    newAlerts: counts.newAlerts,
    ongoingAlerts: counts.ongoingAlerts,
    resolvedAlerts: counts.resolvedAlerts,
  });
  return counts;
}

function alertValues(projectId: number, finding: MonitoringFinding, evaluatedAt: Date) {
  return {
    projectId,
    findingKey: finding.key,
    issueId: finding.issueId,
    rule: finding.rule,
    severity: finding.severity,
    evidence: finding.evidence,
    explanation: finding.explanation,
    nextAction: finding.nextAction,
    firstSeenAt: evaluatedAt,
    lastSeenAt: evaluatedAt,
    status: 'active' as const,
  };
}
