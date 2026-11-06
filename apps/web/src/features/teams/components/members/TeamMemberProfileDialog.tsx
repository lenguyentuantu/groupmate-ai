'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TeamMember } from '@/lib/api/endpoints/teams';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import TeamMemberProfilePanel from './TeamMemberProfilePanel';

export default function TeamMemberProfileDialog({
  teamId,
  member,
}: {
  teamId: number;
  member: TeamMember;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('teams.profile');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={t('title', { name: member.name || member.email })}
        >
          {t('open')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title', { name: member.name || member.email })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {open && <TeamMemberProfilePanel teamId={teamId} userId={member.userId} />}
      </DialogContent>
    </Dialog>
  );
}
