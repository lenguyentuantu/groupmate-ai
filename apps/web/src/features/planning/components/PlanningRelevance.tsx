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
          const filename =
            sources.find((source) => source.attachmentId === assessment.attachmentId)?.filename ??
            assessment.attachmentId;
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
              {!!assessment.relevantBlockRefs.length && (
                <p className="text-xs">
                  {t('relevantBlocks')}: {assessment.relevantBlockRefs.join(', ')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
