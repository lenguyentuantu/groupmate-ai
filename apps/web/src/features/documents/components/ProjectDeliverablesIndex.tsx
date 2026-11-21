'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BookOpenText, Download, FileCheck2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { deliverableDownloadUrl, listProjectDeliverables } from '@/lib/api/endpoints/deliverables';
import { qk } from '@/services/queryKeys';
import { formatDateTime } from '@/utils/dates';
import { issuePath } from '@/utils/paths';

export default function ProjectDeliverablesIndex({
  projectKey,
  onShowDocuments,
}: {
  projectKey: string;
  onShowDocuments: () => void;
}) {
  const t = useTranslations('documents');
  const query = useQuery({
    queryKey: qk.projectDeliverables(projectKey),
    queryFn: () => listProjectDeliverables(projectKey),
  });

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b bg-background/95 px-4 md:px-6">
        <div className="mx-auto flex min-h-20 w-full max-w-6xl items-center gap-3 py-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <BookOpenText className="size-4.5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-xl font-semibold tracking-[-0.02em]">
              {t('hubTitle')}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('hubDescription')}</p>
          </div>
        </div>
      </header>

      <div className="shrink-0 border-b px-4 md:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected="false"
            className="h-11 px-0.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={onShowDocuments}
          >
            {t('sharedDocuments')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected="true"
            className="relative h-11 border-b-2 border-foreground px-0.5 text-sm font-medium"
          >
            {t('submittedDeliverables')}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-6xl">
          {query.isLoading ? (
            <div className="space-y-3" aria-hidden>
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : query.isError ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center">
              <p className="text-sm font-medium">{t('deliverablesLoadFailed')}</p>
              <Button
                className="mt-3"
                variant="outline"
                size="sm"
                onClick={() => void query.refetch()}
              >
                <RefreshCw /> {t('reload')}
              </Button>
            </div>
          ) : query.data?.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center">
              <div className="mb-3 grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <FileCheck2 className="size-5" />
              </div>
              <p className="text-sm font-medium">{t('noSubmittedDeliverables')}</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                {t('noSubmittedDeliverablesHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {query.data?.map(({ issue, submission }) => (
                <article key={submission.id} className="rounded-xl border bg-card p-4 shadow-xs">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={issuePath(projectKey, issue.sequenceNumber)}
                        className="text-sm font-semibold hover:underline"
                      >
                        {issue.identifier} · {issue.title}
                      </Link>
                      <p className="mt-1 truncate text-sm" dir="auto">
                        {submission.filename} ·{' '}
                        {t('deliverableVersion', { version: submission.version })}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {submission.submittedBy.name} · {formatDateTime(submission.submittedAt)}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a href={deliverableDownloadUrl(submission.fileUrl)}>
                        <Download /> {t('downloadOriginal')}
                      </a>
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-muted px-2.5 py-1">
                      {t(`deliverableReviewStatus.${submission.reviewStatus}`)}
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-1">
                      {submission.decision
                        ? t(`deliverableDecision.${submission.decision}`)
                        : t('deliverableDecision.pending')}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
