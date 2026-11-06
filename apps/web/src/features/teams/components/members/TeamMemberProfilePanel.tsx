'use client';

import { useTranslations, useFormatter } from 'next-intl';
import { useMemberProfile } from '@/services/teams.service';
import { Button } from '@/components/ui/button';
import TeamMemberProfileForm from './TeamMemberProfileForm';
import TeamMemberWorkload from './TeamMemberWorkload';

export default function TeamMemberProfilePanel({
  teamId,
  userId,
}: {
  teamId: number;
  userId: string;
}) {
  const query = useMemberProfile(teamId, userId);
  const t = useTranslations('teams.profile');
  const format = useFormatter();
  if (query.isPending) return <p role="status">{t('loading')}</p>;
  if (query.isError)
    return (
      <div role="alert">
        <p>{t('loadFailed')}</p>
        <Button onClick={() => void query.refetch()}>{t('retry')}</Button>
      </div>
    );
  const profile = query.data;
  const hours = (minutes: number) => format.number(minutes / 60, { maximumFractionDigits: 2 });
  return (
    <div className="space-y-6">
      <TeamMemberWorkload profile={profile} />
      <Button
        variant="ghost"
        size="sm"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        {t('refresh')}
      </Button>
      {profile.canEdit ? (
        <TeamMemberProfileForm teamId={teamId} userId={userId} profile={profile} />
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">{t('readOnly')}</p>
          <div>
            <h3 className="font-medium">{t('skills')}</h3>
            {profile.skills.length ? (
              <ul className="space-y-1">
                {profile.skills.map((skill) => (
                  <li key={skill.name}>
                    <span dir="auto">{skill.name}</span> — {skill.proficiency}/5
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t('noSkills')}</p>
            )}
          </div>
          <div>
            <h3 className="font-medium">{t('availability')}</h3>
            <p>
              {profile.weeklyAvailabilityMinutes === null
                ? t('unknown')
                : t('hoursPerWeek', { hours: hours(profile.weeklyAvailabilityMinutes) })}
            </p>
          </div>
          <div>
            <h3 className="font-medium">{t('preferences')}</h3>
            <p className="whitespace-pre-wrap" dir="auto">
              {profile.preferences || t('none')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
