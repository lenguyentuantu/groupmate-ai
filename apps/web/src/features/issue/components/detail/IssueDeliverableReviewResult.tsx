import type { DeliverableReview } from '@/lib/api/endpoints/deliverables';
import { useTranslations } from 'next-intl';

export default function IssueDeliverableReviewResult({ review }: { review: DeliverableReview }) {
  const t = useTranslations('issue.deliverable');
  return (
    <div className="mt-4 space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
      <div>
        <p className="flex items-center gap-2 font-semibold text-primary">
          <span className="size-2 rounded-full bg-primary" />
          {t('aiAssessment')}
        </p>
        <p className="mt-2 leading-6 text-muted-foreground">{review.overallAssessment}</p>
      </div>
      <div className="space-y-2">
        {review.criteriaResults.map((criterion, index) => (
          <div
            key={`${criterion.criterion}-${index}`}
            className="rounded-lg border bg-card p-3 shadow-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{criterion.criterion}</span>
              <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                {t(`criterionStatus.${criterion.status}`)}
              </span>
            </div>
            <p className="mt-2 leading-5 text-muted-foreground">{criterion.explanation}</p>
            {criterion.evidence && (
              <div className="mt-2 rounded-md bg-muted/70 px-3 py-2 text-xs leading-5">
                <span className="font-medium">{t('evidence')}: </span>
                {criterion.evidence}
              </div>
            )}
          </div>
        ))}
      </div>
      {review.missingRequirements.length > 0 && (
        <div>
          <p className="font-medium">{t('missingRequirements')}</p>
          <ul className="mt-1 list-disc space-y-1 ps-5 text-muted-foreground">
            {review.missingRequirements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {review.improvementSuggestions.length > 0 && (
        <div>
          <p className="font-medium">{t('improvements')}</p>
          <ul className="mt-1 list-disc space-y-1 ps-5 text-muted-foreground">
            {review.improvementSuggestions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">{t('advisory')}</p>
    </div>
  );
}
