'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import ListPager from '@/components/common/ListPager';
import { usePaging } from '@/hooks/usePaging';
import { usePlanRevision, usePlanRevisions } from '@/services/planning.service';
import PlanningReview from './PlanningReview';

export default function PlanningHistory({ projectRef, id }: { projectRef: string; id: number }) {
  const t = useTranslations('documents.planning');
  const paging = usePaging();
  const [version, setVersion] = useState<number | null>(null);
  const history = usePlanRevisions(projectRef, id, paging.params);
  const revision = usePlanRevision(projectRef, id, version);
  return (
    <details className="space-y-3 rounded border p-4">
      <summary>{t('history')}</summary>
      {history.isError && <p role="alert">{history.error.message}</p>}
      {history.data?.items.map((item) => (
        <Button
          type="button"
          key={item.version}
          variant="ghost"
          onClick={() => setVersion(item.version)}
        >
          {t('version', { version: item.version })} · {new Date(item.createdAt).toLocaleString()}
        </Button>
      ))}
      <ListPager paging={paging} total={history.data?.total ?? 0} />
      {version !== null && revision.isPending && <p role="status">{t('loading')}</p>}
      {revision.isError && <p role="alert">{revision.error.message}</p>}
      {revision.data && (
        <PlanningReview plan={revision.data.content} sources={revision.data.sources} />
      )}
    </details>
  );
}
