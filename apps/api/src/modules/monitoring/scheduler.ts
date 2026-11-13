import { db, monitoringAlert, monitoringRun, projectSetting } from '@repo/db';
import { and, eq, sql } from 'drizzle-orm';
import { runScheduledProjectMonitoring } from './service';
import { notifyMonitoringResult } from './notifications';

export const MONITORING_SETTING_KEY = 'monitoring';
export const MONITORING_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const DEFAULT_MONITORING_SCHEDULE: MonitoringScheduleSetting = {
  enabled: false,
  frequency: 'daily',
  hour: 9,
  minute: 0,
  timeZone: MONITORING_TIME_ZONE,
};

export interface MonitoringScheduleSetting {
  enabled: boolean;
  frequency: 'daily' | 'weekdays';
  hour: number;
  minute: number;
  timeZone: typeof MONITORING_TIME_ZONE;
}

export interface ScheduledMonitoringResult {
  projectId: number;
  newAlerts: number;
  ongoingAlerts: number;
  resolvedAlerts: number;
  notifications: number;
}

export function normalizeMonitoringSchedule(value: unknown): MonitoringScheduleSetting {
  if (!value || typeof value !== 'object') return { ...DEFAULT_MONITORING_SCHEDULE };
  const input = value as Record<string, unknown>;
  const frequency = input.frequency === 'weekdays' ? 'weekdays' : 'daily';
  const hour =
    typeof input.hour === 'number' &&
    Number.isInteger(input.hour) &&
    input.hour >= 0 &&
    input.hour <= 23
      ? input.hour
      : DEFAULT_MONITORING_SCHEDULE.hour;
  const minute =
    typeof input.minute === 'number' &&
    Number.isInteger(input.minute) &&
    input.minute >= 0 &&
    input.minute <= 59
      ? input.minute
      : DEFAULT_MONITORING_SCHEDULE.minute;
  return {
    enabled: input.enabled === true,
    frequency,
    hour,
    minute,
    timeZone: MONITORING_TIME_ZONE,
  };
}

export function validateMonitoringSchedule(
  input: MonitoringScheduleSetting,
): MonitoringScheduleSetting {
  if (typeof input.enabled !== 'boolean') {
    throw new Error('Monitoring enabled must be a boolean');
  }
  if (input.frequency !== 'daily' && input.frequency !== 'weekdays') {
    throw new Error('Monitoring frequency must be daily or weekdays');
  }
  if (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23) {
    throw new Error('Monitoring hour must be an integer from 0 to 23');
  }
  if (!Number.isInteger(input.minute) || input.minute < 0 || input.minute > 59) {
    throw new Error('Monitoring minute must be an integer from 0 to 59');
  }
  if (input.timeZone !== MONITORING_TIME_ZONE) {
    throw new Error(`Monitoring time zone must be ${MONITORING_TIME_ZONE}`);
  }
  return input;
}

export async function getMonitoringSchedule(projectId: number): Promise<MonitoringScheduleSetting> {
  const [row] = await db
    .select({ value: projectSetting.value })
    .from(projectSetting)
    .where(
      and(eq(projectSetting.projectId, projectId), eq(projectSetting.key, MONITORING_SETTING_KEY)),
    );
  return normalizeMonitoringSchedule(row?.value);
}

export async function getMonitoringSettings(projectId: number) {
  const schedule = await getMonitoringSchedule(projectId);
  const [lastRun] = await db
    .select({ evaluatedAt: monitoringRun.evaluatedAt, status: monitoringRun.status })
    .from(monitoringRun)
    .where(eq(monitoringRun.projectId, projectId))
    .orderBy(sql`${monitoringRun.evaluatedAt} DESC`)
    .limit(1);
  return {
    ...schedule,
    lastRunAt: lastRun?.evaluatedAt.toISOString() ?? null,
    lastRunStatus: lastRun?.status ?? null,
  };
}

export async function setMonitoringSchedule(
  projectId: number,
  input: MonitoringScheduleSetting,
): Promise<MonitoringScheduleSetting> {
  const schedule = validateMonitoringSchedule(input);
  await db
    .insert(projectSetting)
    .values({ projectId, key: MONITORING_SETTING_KEY, value: schedule })
    .onConflictDoUpdate({
      target: [projectSetting.projectId, projectSetting.key],
      set: { value: schedule, updatedAt: sql`now()` },
    });
  return schedule;
}

function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MONITORING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function isMonitoringDue(
  now: Date,
  latestRunAt: Date | null,
  schedule: MonitoringScheduleSetting = DEFAULT_MONITORING_SCHEDULE,
): boolean {
  const values = localParts(now);
  const scheduleMinutes = schedule.hour * 60 + schedule.minute;
  const currentMinutes = Number(values.hour) * 60 + Number(values.minute);
  if (!schedule.enabled || currentMinutes < scheduleMinutes) return false;
  if (schedule.frequency === 'weekdays' && ['Sat', 'Sun'].includes(values.weekday)) return false;
  if (!latestRunAt) return true;
  const latestValues = localParts(latestRunAt);
  const sameDay =
    latestValues.year === values.year &&
    latestValues.month === values.month &&
    latestValues.day === values.day;
  const latestMinutes = Number(latestValues.hour) * 60 + Number(latestValues.minute);
  return !sameDay || latestMinutes < scheduleMinutes;
}

export async function runScheduledMonitoring(
  now: Date = new Date(),
): Promise<ScheduledMonitoringResult[]> {
  const enabled = await db
    .select({ projectId: projectSetting.projectId })
    .from(projectSetting)
    .where(
      and(
        eq(projectSetting.key, MONITORING_SETTING_KEY),
        sql`${projectSetting.value}->>'enabled' = 'true'`,
      ),
    );
  if (enabled.length === 0) return [];
  const processed: ScheduledMonitoringResult[] = [];
  for (const { projectId } of enabled) {
    const previousAlerts = await db
      .select({
        findingKey: monitoringAlert.findingKey,
        severity: monitoringAlert.severity,
        status: monitoringAlert.status,
      })
      .from(monitoringAlert)
      .where(eq(monitoringAlert.projectId, projectId));
    const [latestRun] = await db
      .select({ evaluatedAt: monitoringRun.evaluatedAt })
      .from(monitoringRun)
      .where(and(eq(monitoringRun.projectId, projectId), eq(monitoringRun.status, 'succeeded')))
      .orderBy(sql`${monitoringRun.evaluatedAt} DESC`)
      .limit(1);
    const firstRun = !latestRun;
    try {
      const schedule = normalizeMonitoringSchedule(
        (
          await db
            .select({ value: projectSetting.value })
            .from(projectSetting)
            .where(
              and(
                eq(projectSetting.projectId, projectId),
                eq(projectSetting.key, MONITORING_SETTING_KEY),
              ),
            )
        )[0]?.value,
      );
      const result = await runScheduledProjectMonitoring(projectId, now, schedule);
      if (!result) continue;
      const notifications = await notifyMonitoringResult(result, previousAlerts, firstRun);
      processed.push({
        projectId,
        ...result.counts,
        notifications,
      });
    } catch (error) {
      console.error(`[monitoring] scheduled project ${projectId} failed:`, error);
    }
  }
  return processed;
}

export function monitoringSchedulePreview(now: Date, latestRunAt: Date | null) {
  return {
    enabledByDefault: false,
    due: isMonitoringDue(now, latestRunAt),
    timeZone: MONITORING_TIME_ZONE,
  };
}
