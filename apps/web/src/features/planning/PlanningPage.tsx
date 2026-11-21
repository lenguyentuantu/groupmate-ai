'use client';
import { useState } from 'react';
import { ArrowLeft, Plus, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useShellRoute } from '@/hooks/useShellRoute';
import { usePermissions } from '@/hooks/usePermissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePaging } from '@/hooks/usePaging';
import { usePlanDraft, usePlanDrafts } from '@/services/planning.service';
import { Button } from '@/components/ui/button';
import ListPager from '@/components/common/ListPager';
import PlanningEditor from './components/PlanningEditor';
import PlanningDraftList from './components/PlanningDraftList';
import PlanningWorkflowSteps from './components/PlanningWorkflowSteps';

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
    <main className="min-h-0 flex-1 overflow-y-auto">
      {selection !== null ? (
        <div className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                if (window.confirm(t('leave'))) setSelection(null);
              }}
            >
              <ArrowLeft />
              {t('back')}
            </Button>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {selection === 'new' ? t('newDraftStatus') : t('editingStatus')}
            </span>
          </div>
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
            <div className="rounded-xl border bg-card p-4" role="alert">
              <p className="text-sm text-destructive">{draft.error.message}</p>
              <Button className="mt-3" variant="outline" onClick={() => void draft.refetch()}>
                {t('retry')}
              </Button>
            </div>
          ) : (
            <PlanningEditor
              key={`${ref}:${draft.data.id}`}
              draft={draft.data}
              projectRef={ref}
              onSaved={() => {}}
              canEdit={can('documents', 'edit')}
            />
          )}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-6xl space-y-7 p-4 sm:p-6 lg:p-8">
          <section className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  <Sparkles className="size-3.5" />
                  {t('aiWorkspace')}
                </div>
                <h1 className="font-heading text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                  {t('landingTitle')}
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('intro')}</p>
              </div>
              {can('documents', 'create') && (
                <Button size="lg" onClick={() => setSelection('new')}>
                  <Plus />
                  {t('new')}
                </Button>
              )}
            </div>
          </section>

          <PlanningWorkflowSteps />

          <section className="space-y-4">
            <div>
              <h2 className="font-heading text-lg font-semibold tracking-tight">{t('drafts')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('draftsHelp')}</p>
            </div>
            {list.isPending && <p role="status">{t('loading')}</p>}
            {list.isError && (
              <div className="rounded-xl border bg-card p-4" role="alert">
                <p className="text-sm text-destructive">{list.error.message}</p>
                <Button className="mt-3" variant="outline" onClick={() => void list.refetch()}>
                  {t('retry')}
                </Button>
              </div>
            )}
            {list.data?.total === 0 && (
              <div className="rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
                <Sparkles className="mx-auto size-7 text-primary" />
                <p className="mt-3 text-sm font-medium">{t('empty')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('emptyHelp')}</p>
              </div>
            )}
            {list.data && list.data.items.length > 0 && (
              <PlanningDraftList drafts={list.data.items} onOpen={setSelection} />
            )}
            {list.data && list.data.total > paging.params.pageSize && (
              <ListPager paging={paging} total={list.data.total} />
            )}
          </section>
        </div>
      )}
    </main>
  );
}
