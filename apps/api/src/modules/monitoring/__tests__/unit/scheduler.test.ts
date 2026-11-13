import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_MONITORING_SCHEDULE,
  isMonitoringDue,
  monitoringSchedulePreview,
  normalizeMonitoringSchedule,
  validateMonitoringSchedule,
} from '../../scheduler';

describe('monitoring scheduler', () => {
  it('is disabled unless a project setting opts in and is due once after 09:00 local time', () => {
    const now = new Date('2026-04-15T03:00:00.000Z');
    expect(monitoringSchedulePreview(now, null)).toEqual({
      enabledByDefault: false,
      due: false,
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const enabled = { ...DEFAULT_MONITORING_SCHEDULE, enabled: true };
    expect(isMonitoringDue(now, new Date('2026-04-15T02:00:00.000Z'), enabled)).toBe(false);
    expect(isMonitoringDue(now, new Date('2026-04-15T00:30:00.000Z'), enabled)).toBe(true);
    expect(isMonitoringDue(new Date('2026-04-15T00:59:59.000Z'), null, enabled)).toBe(false);
  });

  it('supports weekdays and validates the persisted schedule', () => {
    const weekdays = {
      ...DEFAULT_MONITORING_SCHEDULE,
      enabled: true,
      frequency: 'weekdays' as const,
    };
    expect(isMonitoringDue(new Date('2026-04-18T03:00:00.000Z'), null, weekdays)).toBe(false);
    expect(() => validateMonitoringSchedule({ ...weekdays, hour: 24 })).toThrow(
      'integer from 0 to 23',
    );
    expect(() => validateMonitoringSchedule({ ...weekdays, minute: 60 })).toThrow(
      'integer from 0 to 59',
    );
  });

  it('supports minute precision and keeps legacy whole-hour settings', () => {
    const schedule = { ...DEFAULT_MONITORING_SCHEDULE, enabled: true, hour: 9, minute: 30 };
    expect(isMonitoringDue(new Date('2026-04-15T02:29:00.000Z'), null, schedule)).toBe(false);
    expect(isMonitoringDue(new Date('2026-04-15T02:30:00.000Z'), null, schedule)).toBe(true);
    expect(
      isMonitoringDue(new Date('2026-04-15T07:15:00.000Z'), new Date('2026-04-15T07:15:00.000Z'), {
        ...schedule,
        hour: 14,
        minute: 15,
      }),
    ).toBe(false);
    expect(normalizeMonitoringSchedule({ enabled: true, frequency: 'daily', hour: 9 })).toEqual({
      ...schedule,
      minute: 0,
    });
  });
});
