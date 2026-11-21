'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import { listNotifications, type Notification } from '@/lib/api/endpoints/notifications';
import { qk } from '@/services/queryKeys';
import { documentPath, issuePath } from '@/utils/paths';
import { revScope } from '@/utils/revScopes';

const IMPORTANT_TYPES = new Set(['assigned', 'ready', 'reminder', 'escalation']);

function shortTitle(value: string | null) {
  const title = value?.trim() ?? '';
  return title.length > 72 ? `${title.slice(0, 69)}…` : title;
}

function toastTitle(notification: Notification) {
  const title = shortTitle(notification.issueTitle ?? notification.documentTitle);
  if (notification.issueSeq != null) {
    const ref = `${notification.projectKey}-${notification.issueSeq}`;
    return title ? `${ref} — ${title}` : ref;
  }
  return title || notification.projectName;
}

export default function NotificationToastListener({
  projects,
}: {
  projects: { id: number; ref: string }[];
}) {
  const router = useRouter();
  const eventText = useTranslations('inbox.event');
  const labels = useTranslations('inbox.toast');
  const seenIds = useRef<Set<number> | null>(null);

  useLiveRefresh({ scope: revScope.inboxAll, targets: [qk.notificationToasts] });
  const { data } = useQuery({
    queryKey: qk.notificationToasts,
    queryFn: () =>
      listNotifications(undefined, {
        limit: 30,
        filters: { includeRead: true, includeSnoozed: true },
      }),
  });

  useEffect(() => {
    if (!data) return;
    if (!seenIds.current) {
      seenIds.current = new Set(data.items.map((notification) => notification.id));
      return;
    }

    const unseen = data.items.filter((notification) => !seenIds.current!.has(notification.id));
    for (const notification of data.items) seenIds.current.add(notification.id);

    for (const notification of unseen.reverse()) {
      const who = notification.actorName ?? eventText('someone');
      let description: string;
      switch (notification.type) {
        case 'assigned':
          description = eventText('assigned', { who });
          break;
        case 'mentioned':
          description = eventText('mentioned', { who });
          break;
        case 'commented':
          description = eventText('commented', { who });
          break;
        case 'state_changed':
          description =
            notification.fromState && notification.toState
              ? eventText('stateChanged', {
                  who,
                  from: notification.fromState,
                  to: notification.toState,
                })
              : eventText('stateChangedPlain', { who });
          break;
        case 'ready':
          description = eventText('ready');
          break;
        case 'reminder':
          description = eventText('reminder');
          break;
        case 'escalation':
          description = eventText('escalation');
          break;
        case 'monitoring':
          description = eventText('monitoring');
          break;
      }

      const projectRef = projects.find((project) => project.id === notification.projectId)?.ref;
      const destination =
        projectRef && notification.issueSeq != null
          ? issuePath(projectRef, notification.issueSeq)
          : projectRef && notification.documentId != null
            ? documentPath(projectRef, notification.documentId)
            : null;
      const options = {
        id: `notification-${notification.id}`,
        description,
        duration: IMPORTANT_TYPES.has(notification.type) ? 10_000 : 7_000,
        closeButton: true,
        position: 'top-right' as const,
        action: destination
          ? {
              label: notification.issueId != null ? labels('openIssue') : labels('openDocument'),
              onClick: () => router.push(destination),
            }
          : undefined,
      };
      const title = toastTitle(notification);
      if (notification.type === 'escalation') toast.warning(title, options);
      else toast(title, options);
    }
  }, [data, eventText, labels, projects, router]);

  return null;
}
