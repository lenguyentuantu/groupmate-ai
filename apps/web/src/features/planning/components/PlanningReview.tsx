'use client';
import { useTranslations } from 'next-intl';
import type { Plan, PlanSource } from '@/lib/api/endpoints/planning';

export default function PlanningReview({ plan, sources }: { plan: Plan; sources: PlanSource[] }) {
  const t = useTranslations('documents.planning');
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{plan.title}</h2>
      <p className="whitespace-pre-wrap" dir="auto">
        {plan.brief}
      </p>
      <p>
        {t('deadline')}: {plan.deadline || t('unknown')}
      </p>
      {(['objectives', 'assumptions', 'questions'] as const).map((key) => (
        <section key={key}>
          <h3 className="font-semibold">{t(key)}</h3>
          <ul>
            {plan[key].map((text, i) => (
              <li key={i} dir="auto">
                {text}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {plan.tasks.map((task) => (
        <details key={task.id} className="rounded border p-3">
          <summary>
            {task.title} · {task.id}
          </summary>
          <dl>
            {Object.entries(task)
              .filter(([key]) => key !== 'id' && key !== 'title')
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="font-medium">
                    {t(
                      key === 'parentId'
                        ? 'parent'
                        : key === 'estimateMinutes'
                          ? 'estimate'
                          : (key as 'description'),
                    )}
                  </dt>
                  <dd className="whitespace-pre-wrap" dir="auto">
                    {Array.isArray(value) ? value.join('\n') : (value ?? t('unknown'))}
                  </dd>
                </div>
              ))}
          </dl>
        </details>
      ))}
      <h3 className="font-semibold">{t('sources')}</h3>
      <p className="text-xs text-muted-foreground">{t('sourceHelp')}</p>
      {sources.map((source) => (
        <details key={source.attachmentId}>
          <summary>{source.filename}</summary>
          {source.blocks.map((block) => (
            <div className="my-3" key={block.ref}>
              <code>{block.ref}</code>
              <p className="whitespace-pre-wrap" dir="auto">
                {block.text}
              </p>
            </div>
          ))}
        </details>
      ))}
    </div>
  );
}
