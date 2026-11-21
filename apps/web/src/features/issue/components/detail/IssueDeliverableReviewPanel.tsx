import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { usePersistedOpen } from '@/hooks/usePersistedOpen';
import { useTranslations } from 'next-intl';
import {
  useDecideDeliverable,
  useDeliverableQuery,
  useReviewDeliverable,
  useSubmitDeliverable,
} from '../../services/deliverables.service';
import IssueSectionHeading from './IssueSectionHeading';
import IssueDeliverableSubmissionCard from './IssueDeliverableSubmissionCard';

export default function IssueDeliverableReviewPanel({ issueId }: { issueId: number }) {
  const t = useTranslations('issue.deliverable');
  const { open, toggle } = usePersistedOpen('issue-deliverable-open');
  const query = useDeliverableQuery(issueId);
  const submit = useSubmitDeliverable(issueId);
  const review = useReviewDeliverable(issueId);
  const decide = useDecideDeliverable(issueId);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const state = query.data;
  const busy = submit.isPending || review.isPending || decide.isPending;

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      await submit.mutateAsync(file);
      toast.success(t('submitted'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('submitFailed'));
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className={`mt-6 rounded-xl border bg-card/70 px-4 py-4 shadow-xs ${open ? '' : '-mb-2'}`}>
      <div className={`flex h-7 items-center justify-between gap-3 ${open ? 'mb-3' : ''}`}>
        <IssueSectionHeading label={t('title')} open={open} onToggle={toggle} />
        {open && state?.canSubmit && (
          <Button
            size="sm"
            className="h-7 gap-1.5"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Plus className="size-4" />
            {state.submissions.length > 0 ? t('submitNewVersion') : t('submit')}
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(event) => void upload(event.target.files?.[0])}
        />
      </div>

      {open && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t('hint')}</p>
          {(error || query.error) && (
            <p className="text-xs text-destructive">{error ?? query.error?.message}</p>
          )}
          {state && (
            <p className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {t(`status.${state.status}`)}
            </p>
          )}
          {state?.submissions.length === 0 && (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              {t('empty')}
            </p>
          )}
          {state?.submissions.map((submission, index) => (
            <IssueDeliverableSubmissionCard
              key={submission.id}
              submission={submission}
              current={index === 0}
              canReview={Boolean(index === 0 && state.canReview)}
              canDecide={Boolean(index === 0 && state.canDecide)}
              busy={busy}
              onReview={() => {
                setError(null);
                review.mutate(submission.id, {
                  onSuccess: () => toast.success(t('reviewComplete')),
                  onError: (cause) => setError(cause.message),
                });
              }}
              onDecide={(decision, comment) => {
                setError(null);
                decide.mutate(
                  { submissionId: submission.id, decision, comment },
                  {
                    onSuccess: () =>
                      toast.success(t(decision === 'ACCEPT' ? 'accepted' : 'revisionRequested')),
                    onError: (cause) => setError(cause.message),
                  },
                );
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
