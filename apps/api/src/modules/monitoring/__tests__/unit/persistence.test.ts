import { describe, expect, it } from 'bun:test';
import { calculateAlertChanges } from '../../persistence';

const finding = (key: string) => ({
  key,
  projectId: 1,
  issueId: 10,
  rule: 'OVERDUE' as const,
  severity: 'high' as const,
  explanation: 'explanation',
  evidence: 'evidence',
  nextAction: 'next action',
});

describe('calculateAlertChanges', () => {
  it('counts new alerts on the first run', () => {
    expect(calculateAlertChanges([], [finding('1:10:OVERDUE')])).toEqual({
      newAlerts: 1,
      ongoingAlerts: 0,
      resolvedAlerts: 0,
    });
  });

  it('keeps repeated findings ongoing and resolves only missing active findings', () => {
    expect(
      calculateAlertChanges(
        [
          { findingKey: '1:10:OVERDUE', status: 'active' },
          { findingKey: '1:11:UNASSIGNED', status: 'active' },
          { findingKey: '1:12:DUE_SOON', status: 'resolved' },
        ],
        [finding('1:10:OVERDUE')],
      ),
    ).toEqual({ newAlerts: 0, ongoingAlerts: 1, resolvedAlerts: 1 });
  });

  it('treats a resolved finding that returns as new', () => {
    expect(
      calculateAlertChanges(
        [{ findingKey: '1:10:OVERDUE', status: 'resolved' }],
        [finding('1:10:OVERDUE')],
      ),
    ).toEqual({ newAlerts: 1, ongoingAlerts: 0, resolvedAlerts: 0 });
  });

  it('keeps project-scoped finding keys independent', () => {
    expect(
      calculateAlertChanges(
        [{ findingKey: '2:10:OVERDUE', status: 'active' }],
        [finding('1:10:OVERDUE')],
      ),
    ).toEqual({ newAlerts: 1, ongoingAlerts: 0, resolvedAlerts: 1 });
  });
});
