'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Bell, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShell } from '@/context/shellContext';
import InboxView from '@/features/inbox/components/InboxView';
import NotificationPreferencesPage from '@/features/settings/NotificationPreferencesPage';

export default function NotificationCenterPage() {
  const { project } = useShell();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (!project) return null;
  const settings = searchParams.get('tab') === 'settings';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b px-4 py-2" role="tablist">
        <Button variant={settings ? 'ghost' : 'secondary'} size="sm" asChild>
          <Link href={pathname} role="tab" aria-selected={!settings}>
            <Bell /> Hộp thư
          </Link>
        </Button>
        <Button variant={settings ? 'secondary' : 'ghost'} size="sm" asChild>
          <Link href={`${pathname}?tab=settings`} role="tab" aria-selected={settings}>
            <Settings2 /> Cài đặt thông báo
          </Link>
        </Button>
      </div>
      <div
        className={settings ? 'min-h-0 flex-1 overflow-y-auto' : 'min-h-0 flex-1 overflow-hidden'}
      >
        {settings ? (
          <NotificationPreferencesPage />
        ) : (
          <InboxView key={project.project.ref} project={project} />
        )}
      </div>
    </div>
  );
}
