import type { NotificationEventToggles } from '@/lib/api/endpoints/notificationSettings';

// The events a channel can send, matching the inbox notification types.
// Shared by the email and telegram event sections; the label of an event is a
// message under `settings.notifications.events`.
export const NOTIFICATION_EVENTS: (keyof NotificationEventToggles)[] = [
  'assigned',
  'mentioned',
  'commented',
  'state_changed',
  'ready',
  'reminder',
  'escalation',
  'monitoring',
];

export function eventsEqual(a: NotificationEventToggles, b: NotificationEventToggles): boolean {
  return (
    a.assigned === b.assigned &&
    a.mentioned === b.mentioned &&
    a.commented === b.commented &&
    a.state_changed === b.state_changed &&
    a.ready === b.ready &&
    a.reminder === b.reminder &&
    a.escalation === b.escalation &&
    a.monitoring === b.monitoring
  );
}
