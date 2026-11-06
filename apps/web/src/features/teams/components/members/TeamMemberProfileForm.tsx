'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MemberProfileInput } from '@/lib/api/endpoints/teams';
import { useSetMemberProfile } from '@/services/teams.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import TeamMemberSkillFields from './TeamMemberSkillFields';

export default function TeamMemberProfileForm({
  teamId,
  userId,
  profile,
}: {
  teamId: number;
  userId: string;
  profile: MemberProfileInput;
}) {
  const t = useTranslations('teams.profile');
  const id = useId();
  const [skills, setSkills] = useState(profile.skills);
  const [hours, setHours] = useState(
    profile.weeklyAvailabilityMinutes === null
      ? ''
      : String(profile.weeklyAvailabilityMinutes / 60),
  );
  const [preferences, setPreferences] = useState(profile.preferences);
  const save = useSetMemberProfile(teamId, userId);
  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          await save.mutateAsync({
            skills,
            weeklyAvailabilityMinutes: hours === '' ? null : Math.round(Number(hours) * 60),
            preferences,
          });
        } catch {
          // The mutation cache displays the error and the form keeps the entered values.
        }
      }}
    >
      <fieldset disabled={save.isPending} className="space-y-5">
        <TeamMemberSkillFields skills={skills} onChange={setSkills} />
        <div className="space-y-2">
          <Label htmlFor={`${id}-hours`}>{t('availability')}</Label>
          <Input
            id={`${id}-hours`}
            type="number"
            min={0}
            max={168}
            step="any"
            value={hours}
            placeholder={t('unknown')}
            onChange={(event) => setHours(event.target.value)}
            aria-describedby={`${id}-availability-help`}
          />
          <p id={`${id}-availability-help`} className="text-xs text-muted-foreground">
            {t('availabilityHelp')}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-preferences`}>{t('preferences')}</Label>
          <Textarea
            id={`${id}-preferences`}
            value={preferences}
            maxLength={1000}
            onChange={(event) => setPreferences(event.target.value)}
            placeholder={t('preferencesHint')}
            dir="auto"
          />
        </div>
        <Button type="submit">{save.isPending ? t('saving') : t('save')}</Button>
      </fieldset>
    </form>
  );
}
