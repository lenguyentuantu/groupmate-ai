'use client';
import { useTranslations } from 'next-intl';
import type { PlanSource, SourceAssessment } from '@/lib/api/endpoints/planning';

export default function PlanningRelevance({
  assessments,
  sources,
}: {
  assessments: SourceAssessment[];
  sources: PlanSource[];
}) {
  const t = useTranslations('documents.planning');
  if (!assessments.length) return <p>{t('relevanceNone')}</p>;
  return (
    <section className="space-y-2 rounded border p-3">
      <h3 className="font-semibold">{t('relevance')}</h3>
      <p className="text-xs text-muted-foreground">{t('relevanceHelp')}</p>
      <ul className="space-y-2">
        {assessments.map((assessment) => {
          const source = sources.find(
            (candidate) => candidate.attachmentId === assessment.attachmentId,
          );
          const filename = source?.filename ?? t('sourceUnavailable');
          const relevantBlocks =
            source?.blocks.filter((block) => assessment.relevantBlockRefs.includes(block.ref)) ??
            [];
          const classification =
            assessment.classification === 'reference_only'
              ? t('referenceOnly')
              : t(assessment.classification);
          return (
            <li className="rounded bg-muted/50 p-2" key={assessment.attachmentId}>
              <p>
                <strong>{filename}</strong> · {classification}
              </p>
              <p dir="auto">{assessment.explanation}</p>
              {relevantBlocks.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer font-medium">
                    {t('relevantBlockCount', { count: relevantBlocks.length })}
                  </summary>
                  <div className="mt-2 space-y-2">
                    {relevantBlocks.map((block, index) => (
                      <p
                        key={block.ref}
                        className="rounded bg-background/70 p-2 leading-5 whitespace-pre-wrap"
                        dir="auto"
                      >
                        {t('sourceExcerpt', { number: index + 1 })}: {block.text}
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
