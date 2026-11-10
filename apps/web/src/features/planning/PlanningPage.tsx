'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useShellRoute } from '@/hooks/useShellRoute';
import { usePermissions } from '@/hooks/usePermissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePaging } from '@/hooks/usePaging';
import { usePlanDraft, usePlanDrafts } from '@/services/planning.service';
import { Button } from '@/components/ui/button';
import ListPager from '@/components/common/ListPager';
import PlanningEditor from './components/PlanningEditor';

export default function PlanningPage() {
  const ref = useShellRoute().projectKey ?? '';
  const t = useTranslations('documents.planning');
  useDocumentTitle(t('title'));
  const { can } = usePermissions();
  const paging = usePaging();
  const [selection, setSelection] = useState<number | 'new' | null>(null);
  const list = usePlanDrafts(ref, paging.params);
  const draft = usePlanDraft(ref, typeof selection === 'number' ? selection : null);
  if (!can('documents', 'read')) return <p>{t('noAccess')}</p>;
  return (
    <main className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground">{t('intro')}</p>
      {selection !== null ? (
        <>
          <Button
            variant="outline"
            onClick={() => {
              if (window.confirm(t('leave'))) setSelection(null);
            }}
          >
            {t('back')}
          </Button>
          {selection === 'new' ? (
            <PlanningEditor
              key="new"
              projectRef={ref}
              onSaved={(id) => setSelection(id)}
              canEdit={can('documents', 'create')}
            />
          ) : draft.isPending ? (
            <p role="status">{t('loading')}</p>
          ) : draft.isError ? (
            <p role="alert">
              {draft.error.message}
              <Button onClick={() => void draft.refetch()}>{t('retry')}</Button>
            </p>
          ) : (
            <PlanningEditor
              key={`${ref}:${draft.data.id}`}
              draft={draft.data}
              projectRef={ref}
              onSaved={() => {}}
              canEdit={can('documents', 'edit')}
            />
          )}
        </>
      ) : (
        <>
          {can('documents', 'create') && (
            <Button onClick={() => setSelection('new')}>{t('new')}</Button>
          )}
          {list.isPending && <p role="status">{t('loading')}</p>}
          {list.isError && (
            <p role="alert">
              {list.error.message}
              <Button onClick={() => void list.refetch()}>{t('retry')}</Button>
            </p>
          )}
          {list.data?.total === 0 && <p>{t('empty')}</p>}
          <ul className="space-y-2">
            {list.data?.items.map((item) => (
              <li key={item.id}>
                <Button variant="outline" onClick={() => setSelection(item.id)}>
                  {item.title} · {t('version', { version: item.version })}
                </Button>
              </li>
            ))}
          </ul>
          <ListPager paging={paging} total={list.data?.total ?? 0} />
        </>
      )}
    </main>
  );
}
