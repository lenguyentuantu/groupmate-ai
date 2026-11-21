import { type ReactNode } from 'react';
import { Mail, Send } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import SettingsSection from '@/components/common/page/SettingsSection';
import NotificationTelegramAccount from './NotificationTelegramAccount';
import type { NotificationPreferencesForm } from '../../hooks/useNotificationPreferencesForm';
import { useTranslations } from 'next-intl';

// A member's own notification preferences for the project: for each issue event, a
// checkbox per channel (email, Telegram). Visible to every member (each edits only
// their own). Email is sent to the account address; Telegram to the account connected
// in the member's profile, shown below. Delivery only happens for channels a project
// owner has configured. Save lives in the page header.

// Shared column template so the header labels line up with every event row.
const COLS = 'grid grid-cols-[1fr_5rem_5rem] items-center';
const GROUPS = [
  { key: 'taskUpdates', events: ['assigned', 'mentioned', 'commented', 'state_changed'] },
  { key: 'smartReminders', events: ['ready', 'reminder', 'escalation'] },
  { key: 'monitoring', events: ['monitoring'] },
] as const;
const GROUP_FALLBACK = {
  taskUpdates: 'Task updates',
  smartReminders: 'Smart reminders',
  monitoring: 'Monitoring',
};
const EVENT_FALLBACK = {
  assigned: ['Assigned', 'When a task is assigned to you.'],
  mentioned: ['Mentioned', 'When someone mentions you.'],
  commented: ['Commented', 'When a watched task receives a comment.'],
  state_changed: ['Status changed', 'When a watched task changes status.'],
  ready: ['Ready', 'When every required predecessor is complete.'],
  reminder: ['Start reminder', 'When your ready task has not started on time.'],
  escalation: ['Leader attention', 'When a ready task needs leader attention.'],
  monitoring: ['Monitoring', 'Deadline and project monitoring findings.'],
} as const;

export default function NotificationPreferences({ form }: { form: NotificationPreferencesForm }) {
  const t = useTranslations('settings.notifications');
  const { emailEvents, setEmailEvents, telegramEvents, setTelegramEvents } = form;
  return (
    <div className="flex flex-col gap-10">
      <SettingsSection title={t('eventsTitle')}>
        <div className="max-w-xl">
          <div className={`${COLS} px-3 pb-1`}>
            <span />
            <ChannelHeader icon={<Mail className="size-3.5" />} label={t('email')} />
            <ChannelHeader icon={<Send className="size-3.5" />} label={t('telegram')} />
          </div>
          <div className="flex flex-col gap-5">
            {GROUPS.map((group) => (
              <div key={group.key}>
                <div className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t.has(`groups.${group.key}`)
                    ? t(`groups.${group.key}`)
                    : GROUP_FALLBACK[group.key]}
                </div>
                {group.events.map((event) => (
                  <ChannelRow
                    key={event}
                    label={
                      t.has(`events.${event}`) ? t(`events.${event}`) : EVENT_FALLBACK[event][0]
                    }
                    description={
                      t.has(`eventDescriptions.${event}`)
                        ? t(`eventDescriptions.${event}`)
                        : EVENT_FALLBACK[event][1]
                    }
                    emailChecked={emailEvents[event]}
                    telegramChecked={telegramEvents[event]}
                    onEmail={(v) => setEmailEvents({ ...emailEvents, [event]: v })}
                    onTelegram={(v) => setTelegramEvents({ ...telegramEvents, [event]: v })}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </SettingsSection>

      <NotificationTelegramAccount />
    </div>
  );
}

function ChannelHeader({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
      {icon}
      {label}
    </span>
  );
}

function ChannelRow({
  label,
  description,
  emailChecked,
  telegramChecked,
  onEmail,
  onTelegram,
}: {
  label: string;
  description: string;
  emailChecked: boolean;
  telegramChecked: boolean;
  onEmail: (value: boolean) => void;
  onTelegram: (value: boolean) => void;
}) {
  return (
    <div className={`${COLS} -mx-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent`}>
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <div className="flex justify-center">
        <Checkbox
          checked={emailChecked}
          onCheckedChange={(v) => onEmail(v === true)}
          aria-label={`${label} — email`}
        />
      </div>
      <div className="flex justify-center">
        <Checkbox
          checked={telegramChecked}
          onCheckedChange={(v) => onTelegram(v === true)}
          aria-label={`${label} — Telegram`}
        />
      </div>
    </div>
  );
}
