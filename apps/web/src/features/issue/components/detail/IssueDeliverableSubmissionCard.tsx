import { useState } from 'react';
import { Download, LoaderCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  deliverableDownloadUrl,
  type DeliverableDecision,
  type DeliverableSubmission,
} from '@/lib/api/endpoints/deliverables';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/utils/dates';
import IssueDeliverableReviewResult from './IssueDeliverableReviewResult';

export default function IssueDeliverableSubmissionCard({
  submission,
  current,
  canReview,
  canDecide,
  busy,
  onReview,
  onDecide,
}: {
  submission: DeliverableSubmission;
  current: boolean;
  canReview: boolean;
  canDecide: boolean;
  busy: boolean;
  onReview: () => void;
  onDecide: (decision: DeliverableDecision, comment?: string) => void;
}) {
  const t = useTranslations('issue.deliverable');
  const [comment, setComment] = useState('');
  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4 shadow-xs',
        current && 'border-primary/30 ring-1 ring-primary/10',
      )}
    >
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {current ? t('latestSubmission') : t('previousSubmission')}
      </p>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {t('version', { version: submission.version })}: {submission.filename}
          </p>
          <p className="text-xs text-muted-foreground">
            {submission.submittedBy.name} · {formatDateTime(submission.submittedAt)}
          </p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <a href={deliverableDownloadUrl(submission.fileUrl)}>
            <Download className="size-4" /> {t('download')}
          </a>
        </Button>
      </div>

      {submission.reviewStatus === 'pending' && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" /> {t('reviewing')}
        </p>
      )}
      {submission.reviewStatus === 'failed' && (
        <p className="mt-2 text-xs text-destructive">
          {submission.reviewError ?? t('reviewFailed')}
        </p>
      )}
      {submission.reviewResult && <IssueDeliverableReviewResult review={submission.reviewResult} />}

      {current && canReview && (
        <Button className="mt-3" size="sm" disabled={busy} onClick={onReview}>
          <Sparkles className="size-4" />{' '}
          {t(
            ['failed', 'pending'].includes(submission.reviewStatus)
              ? 'retryReview'
              : 'reviewWithAi',
          )}
        </Button>
      )}

      {current && canDecide && (
        <div className="mt-4 space-y-3 rounded-lg border bg-muted/35 p-3">
          <div>
            <p className="text-sm font-semibold">{t('leaderDecision')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('advisory')}</p>
          </div>
          <textarea
            className="min-h-20 w-full rounded-md border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            value={comment}
            placeholder={t('decisionComment')}
            onChange={(event) => setComment(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => onDecide('ACCEPT', comment)}>
              {t('accept')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onDecide('REQUEST_REVISION', comment)}
            >
              {t('requestRevision')}
            </Button>
          </div>
        </div>
      )}

      {submission.decision && (
        <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-primary uppercase">
            {t('leaderDecision')}
          </p>
          <p className="font-medium">{t(`decision.${submission.decision}`)}</p>
          {submission.decisionComment && (
            <p className="mt-1 text-muted-foreground">{submission.decisionComment}</p>
          )}
        </div>
      )}
    </div>
  );
}
