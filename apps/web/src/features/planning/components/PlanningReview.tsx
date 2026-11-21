'use client';
import { useTranslations } from 'next-intl';
import type { Plan, PlanSource } from '@/lib/api/endpoints/planning';
import PlanningSourceInspector from './PlanningSourceInspector';
import PlanningWbsSummary from './PlanningWbsSummary';
import PlanningWbsTree from './PlanningWbsTree';

export default function PlanningReview({ plan, sources }: { plan: Plan; sources: PlanSource[] }) {
  const t = useTranslations('documents.planning');
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl font-semibold" dir="auto">
          {plan.title}
        </h2>
      </div>
      <PlanningWbsSummary tasks={plan.tasks} />
      <PlanningWbsTree tasks={plan.tasks} sources={sources} />
      <details className="rounded-xl border bg-card px-4 py-3">
        <summary className="cursor-pointer font-medium">{t('workflow.sources')}</summary>
        <div className="mt-4 space-y-4">
          {plan.brief && (
            <p className="text-sm leading-6 whitespace-pre-wrap" dir="auto">
              {plan.brief}
            </p>
          )}
          {plan.deadline && (
            <p className="text-sm text-muted-foreground">
              {t('deadline')}: {plan.deadline}
            </p>
          )}
          {(['objectives', 'assumptions', 'questions'] as const).map(
            (key) =>
              plan[key].length > 0 && (
                <section key={key}>
                  <h3 className="text-sm font-semibold">{t(key)}</h3>
                  <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                    {plan[key].map((text, index) => (
                      <li key={`${key}-${index}`} dir="auto">
                        {text}
                      </li>
                    ))}
                  </ul>
                </section>
              ),
          )}
        </div>
      </details>
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">{t('sourceEvidence')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('sourceHelp')}</p>
        </div>
        <PlanningSourceInspector sources={sources} />
      </section>
    </div>
  );
}
