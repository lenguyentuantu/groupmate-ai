'use client';

import { useFormatter, useTranslations } from 'next-intl';
import type { MemberProfile } from '@/lib/api/endpoints/teams';

export default function TeamMemberWorkload({ profile }: { profile: MemberProfile }) {
  const t = useTranslations('teams.profile');
  const format = useFormatter();
  const { workload, weeklyAvailabilityMinutes } = profile;
  let capacity: string;
  if (weeklyAvailabilityMinutes === null) {
    capacity = t('capacityUnknown');
  } else if (weeklyAvailabilityMinutes === 0) {
    capacity = t('capacityZero');
  } else {
    capacity = t('capacityWeeks', {
      weeks: format.number(workload.knownEstimateMinutes / weeklyAvailabilityMinutes, {
        maximumFractionDigits: 2,
      }),
    });
  }
  return (
    <section className="space-y-2" aria-label={t('workload')}>
      <h3 className="font-medium">{t('workload')}</h3>
      <dl className="grid grid-cols-3 gap-3 rounded-lg border p-3 text-sm">
        <div>
          <dt>{t('activeTasks')}</dt>
          <dd className="text-lg font-semibold">{workload.activeTasks}</dd>
        </div>
        <div>
          <dt>{t('knownHours')}</dt>
          <dd className="text-lg font-semibold">
            {format.number(workload.knownEstimateMinutes / 60, { maximumFractionDigits: 2 })}
          </dd>
        </div>
        <div>
          <dt>{t('unknownEstimates')}</dt>
          <dd className="text-lg font-semibold">{workload.unknownEstimateTasks}</dd>
        </div>
      </dl>
      <p className="text-sm">{capacity}</p>
      {workload.unknownEstimateTasks > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">{t('estimatesMissing')}</p>
      )}
      <p className="text-xs text-muted-foreground">{t('workloadScope')}</p>
    </section>
  );
}
