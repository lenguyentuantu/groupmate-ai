import { useState } from 'react';
import {
  useMonitoringSettingsQuery,
  useUpdateMonitoringSettings,
} from '../../services/settings.service';
import { usePermissions } from '@/hooks/usePermissions';
import OnOffStatus from '@/components/common/fields/OnOffStatus';
import SettingsCard from '@/components/common/page/SettingsCard';
import SettingsSection from '@/components/common/page/SettingsSection';
import SettingsRow from '@/components/common/page/SettingsRow';
import { Switch } from '@/components/ui/switch';

export default function SettingsMonitoring({ projectKey }: { projectKey: string }) {
  const { isOwner } = usePermissions();
  const query = useMonitoringSettingsQuery(projectKey);
  const update = useUpdateMonitoringSettings(projectKey);
  const [draft, setDraft] = useState<{
    enabled: boolean;
    frequency: 'daily' | 'weekdays';
    hour: number;
    minute: number;
  } | null>(null);
  if (!query.data) return null;
  const settings = draft ?? query.data;
  const save = (next: typeof settings) => {
    setDraft(next);
    void update.mutateAsync({ ...next, timeZone: query.data.timeZone }).then(() => setDraft(null));
  };
  return (
    <SettingsSection
      title="Automatic monitoring"
      description="Run project monitoring without opening the browser. Notifications stay disabled until you enable this setting."
    >
      <SettingsCard className="divide-y divide-border/60">
        <SettingsRow
          title="Enabled"
          description="Only project owners can change this."
          control={
            isOwner ? (
              <Switch
                checked={settings.enabled}
                disabled={update.isPending}
                onCheckedChange={(enabled) => save({ ...settings, enabled })}
              />
            ) : (
              <OnOffStatus on={settings.enabled}>
                {settings.enabled ? 'Enabled' : 'Disabled'}
              </OnOffStatus>
            )
          }
        />
        <SettingsRow
          title="Frequency"
          description="Choose every day or weekdays only."
          control={
            <select
              className="rounded-md border bg-background px-2 py-1 text-sm"
              value={settings.frequency}
              disabled={!isOwner || update.isPending}
              onChange={(event) =>
                save({ ...settings, frequency: event.target.value as 'daily' | 'weekdays' })
              }
            >
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays</option>
            </select>
          }
        />
        <SettingsRow
          title="Local time"
          description={`09:00 default, ${query.data.timeZone}`}
          control={
            <input
              className="w-24 rounded-md border bg-background px-2 py-1 text-sm"
              type="time"
              value={`${String(settings.hour).padStart(2, '0')}:${String(settings.minute).padStart(2, '0')}`}
              disabled={!isOwner || update.isPending}
              onChange={(event) => {
                const [hour, minute] = event.target.value.split(':').map(Number);
                if (
                  Number.isInteger(hour) &&
                  Number.isInteger(minute) &&
                  hour >= 0 &&
                  hour <= 23 &&
                  minute >= 0 &&
                  minute <= 59
                ) {
                  save({ ...settings, hour, minute });
                }
              }}
            />
          }
        />
        <SettingsRow
          title="Last monitoring execution"
          description={query.data.lastRunAt ?? 'No monitoring run yet'}
          control={
            <span className="text-sm text-muted-foreground">{query.data.lastRunStatus ?? '—'}</span>
          }
        />
      </SettingsCard>
    </SettingsSection>
  );
}
