'use client';

import { useTranslations } from 'next-intl';
import type { LaunchPreview } from '@/lib/api/endpoints/planning';

export default function PlanningLaunchCapacity({
  allocations,
}: {
  allocations: LaunchPreview['summary']['knownAllocations'];
}) {
  const t = useTranslations('documents.planning.launch');
  if (allocations.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{t('capacityTitle')}</h3>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-start">
            <tr>
              <th className="px-3 py-2 text-start">{t('member')}</th>
              <th className="px-3 py-2 text-start">{t('planned')}</th>
              <th className="px-3 py-2 text-start">{t('weeklyCapacity')}</th>
              <th className="px-3 py-2 text-start">{t('existingWorkload')}</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((allocation) => (
              <tr className="border-t" key={allocation.memberId}>
                <td className="px-3 py-2" dir="auto">
                  {allocation.memberName}
                </td>
                <td className="px-3 py-2">
                  {t('minutes', { count: allocation.minutes })}
                  {allocation.unknownEstimateTaskCount > 0 &&
                    ` + ${t('unknownTaskCount', { count: allocation.unknownEstimateTaskCount })}`}
                </td>
                <td className="px-3 py-2">
                  {allocation.weeklyCapacityMinutes === null
                    ? t('unknown')
                    : t('minutes', { count: allocation.weeklyCapacityMinutes })}
                </td>
                <td className="px-3 py-2">
                  {allocation.existingKnownWorkloadMinutes === null
                    ? t('unknown')
                    : t('minutes', { count: allocation.existingKnownWorkloadMinutes })}
                  {allocation.unknownWorkloadTasks > 0 &&
                    ` + ${t('unknownTaskCount', { count: allocation.unknownWorkloadTasks })}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
