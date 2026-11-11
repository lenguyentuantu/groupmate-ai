import { describe, expect, it } from 'bun:test';
import { evaluateMonitoring, type MonitoringIssue, type MonitoringLink } from '../../service';

const now = new Date('2026-11-11T12:00:00.000Z');
const issue = (id: number, patch: Partial<MonitoringIssue> = {}): MonitoringIssue => ({
  id,
  title: `Issue ${id}`,
  stateType: 'started',
  assigneeUserId: 'user-1',
  dueDate: '2026-11-13',
  ...patch,
});

describe('evaluateMonitoring', () => {
  it('evaluates missing assignees and deadlines and excludes closed items', () => {
    const result = evaluateMonitoring(
      7,
      [
        issue(1, { assigneeUserId: null, dueDate: null }),
        issue(2, { stateType: 'completed', assigneeUserId: null, dueDate: null }),
        issue(3, { stateType: 'canceled' }),
      ],
      [],
      now,
    );
    expect(result.summary).toMatchObject({ total: 3, completed: 1, active: 1 });
    expect(result.findings.map((item) => item.rule)).toEqual(['MISSING_DEADLINE', 'UNASSIGNED']);
  });

  it('distinguishes due soon from overdue and uses injected time', () => {
    const result = evaluateMonitoring(
      7,
      [
        issue(1, { dueDate: '2026-11-11' }),
        issue(2, { dueDate: '2026-11-14' }),
        issue(3, { dueDate: '2026-11-10' }),
      ],
      [],
      now,
    );
    expect(result.findings.map((item) => [item.issueId, item.rule])).toEqual([
      [1, 'DUE_SOON'],
      [2, 'DUE_SOON'],
      [3, 'OVERDUE'],
    ]);
  });

  it('follows blocks direction and keeps findings stable', () => {
    const issues = [issue(2), issue(1, { stateType: 'completed' })];
    const links: MonitoringLink[] = [{ sourceIssueId: 1, targetIssueId: 2, kind: 'blocks' }];
    const result = evaluateMonitoring(7, issues, links, now);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      key: '7:2:DUE_SOON',
      issueId: 2,
    });
    expect(result.evaluatedAt).toBe('2026-11-11T12:00:00.000Z');
  });

  it('does not cross project boundaries in the pure evaluator input', () => {
    const result = evaluateMonitoring(
      7,
      [issue(1)],
      [{ sourceIssueId: 99, targetIssueId: 1, kind: 'blocks' }],
      now,
    );
    expect(result.findings.some((item) => item.rule === 'BLOCKED_DEPENDENCY')).toBe(false);
  });
});
