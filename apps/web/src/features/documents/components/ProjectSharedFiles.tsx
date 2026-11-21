'use client';

import { Download, ExternalLink, FileText, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { projectFileUrl, type ProjectFile } from '@/lib/api/endpoints/documents';
import { formatDateTime } from '@/utils/dates';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectSharedFiles({
  files,
  loading,
  failed,
  onRetry,
}: {
  files: ProjectFile[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations('documents');

  return (
    <section className="shrink-0 border-b px-4 py-4 md:px-6">
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="text-sm font-semibold">{t('sharedFiles')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('sharedFilesDescription')}</p>
        {loading ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-hidden>
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        ) : failed ? (
          <Button className="mt-3" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw /> {t('sharedFilesRetry')}
          </Button>
        ) : files.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
            {t('noSharedFiles')}
          </p>
        ) : (
          <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto pe-1 sm:grid-cols-2">
            {files.map((file) => (
              <article
                key={file.id}
                className="flex min-w-0 items-center gap-3 rounded-lg border p-3"
              >
                <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  <FileText className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" dir="auto">
                    {file.filename}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {file.uploadedBy.name} · {formatDateTime(file.createdAt)} ·{' '}
                    {formatBytes(file.sizeBytes)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a
                      href={projectFileUrl(file.url)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t('openSharedFile', { name: file.filename })}
                    >
                      <ExternalLink />
                    </a>
                  </Button>
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a
                      href={projectFileUrl(file.url, true)}
                      aria-label={t('downloadSharedFile', { name: file.filename })}
                    >
                      <Download />
                    </a>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
