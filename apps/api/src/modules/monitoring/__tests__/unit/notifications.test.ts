import { describe, expect, it } from 'bun:test';
import {
  monitoringReminderStage,
  nextMonitoringReminderStage,
  shouldNotifyMonitoringFinding,
} from '../../notifications';

describe('monitoring notification policy', () => {
  it('notifies new and reactivated findings, but deduplicates unchanged alerts', () => {
    expect(shouldNotifyMonitoringFinding('high', undefined)).toBe(true);
    expect(
      shouldNotifyMonitoringFinding('high', {
        findingKey: '1:2:OVERDUE',
        severity: 'high',
        status: 'active',
      }),
    ).toBe(false);
    expect(
      shouldNotifyMonitoringFinding('high', {
        findingKey: '1:2:OVERDUE',
        severity: 'high',
        status: 'resolved',
      }),
    ).toBe(true);
  });

  it('notifies only meaningful severity escalation', () => {
    expect(
      shouldNotifyMonitoringFinding('high', {
        findingKey: '1:2:DUE_SOON',
        severity: 'medium',
        status: 'active',
      }),
    ).toBe(true);
    expect(
      shouldNotifyMonitoringFinding('medium', {
        findingKey: '1:2:DUE_SOON',
        severity: 'high',
        status: 'active',
      }),
    ).toBe(false);
  });

  it('uses distinct urgency stages and does not invent a stage without a due date', () => {
    expect(
      monitoringReminderStage('DUE_SOON', '2026-11-14', new Date('2026-11-11T12:00:00.000Z')),
    ).toBe('due-72h');
    expect(
      monitoringReminderStage('DUE_SOON', '2026-11-12', new Date('2026-11-11T12:00:00.000Z')),
    ).toBe('due-24h');
    expect(
      monitoringReminderStage('OVERDUE', '2026-11-10', new Date('2026-11-11T12:00:00.000Z')),
    ).toBe('overdue-initial');
    expect(monitoringReminderStage('DUE_SOON', null, new Date())).toBe(null);
  });

  it('limits overdue follow-ups to one per three days', () => {
    const episode = 'monitoring:7:1:OVERDUE:2026-11-11T12:00:00.000Z';
    const sent = new Map([
      [
        episode,
        [{ stage: 'overdue-initial' as const, createdAt: new Date('2026-11-11T12:00:00.000Z') }],
      ],
    ]);
    expect(
      nextMonitoringReminderStage(
        'overdue-initial',
        episode,
        sent,
        new Date('2026-11-13T12:00:00.000Z'),
      ),
    ).toBe(null);
    expect(
      nextMonitoringReminderStage(
        'overdue-initial',
        episode,
        sent,
        new Date('2026-11-14T12:00:00.000Z'),
      ),
    ).toBe('overdue-follow-up');
  });
});
