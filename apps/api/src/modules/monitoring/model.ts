import { t } from 'elysia';

const finding = t.Object({
  key: t.String(),
  projectId: t.Number(),
  issueId: t.Number(),
  rule: t.Union([
    t.Literal('UNASSIGNED'),
    t.Literal('MISSING_DEADLINE'),
    t.Literal('DUE_SOON'),
    t.Literal('OVERDUE'),
    t.Literal('BLOCKED_DEPENDENCY'),
  ]),
  severity: t.Union([t.Literal('high'), t.Literal('medium'), t.Literal('low')]),
  explanation: t.String(),
  evidence: t.String(),
  nextAction: t.String(),
});

export const monitoringResponse = t.Object({
  projectId: t.Number(),
  evaluatedAt: t.String(),
  summary: t.Object({
    total: t.Number(),
    completed: t.Number(),
    active: t.Number(),
    findingsBySeverity: t.Record(t.String(), t.Number()),
    findingsByRule: t.Record(t.String(), t.Number()),
  }),
  findings: t.Array(finding),
});
