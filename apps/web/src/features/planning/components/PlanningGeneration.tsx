'use client';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useProjectAgents } from '@/hooks/useProjectAgents';
import { usePermissions } from '@/hooks/usePermissions';
import { useGeneratePlan } from '@/services/planning.service';
import type { Plan, PlanSource, SourceAssessment } from '@/lib/api/endpoints/planning';
import PlanningReview from './PlanningReview';
import PlanningRelevance from './PlanningRelevance';
export default function PlanningGeneration({
  projectRef,
  draftId,
  version,
  dirty,
  sources,
  onApply,
  saving,
  onPending,
}: {
  projectRef: string;
  draftId?: number;
  version: number;
  dirty: boolean;
  sources: PlanSource[];
  onApply: (plan: Plan) => void;
  saving: boolean;
  onPending: (pending: boolean) => void;
}) {
  const t = useTranslations('documents.planning');
  const { can } = usePermissions();
  const [preview, setPreview] = useState<{
    content: Plan;
    sourceAssessments: SourceAssessment[];
  } | null>(null);
  const [agentId, setAgentId] = useState('');
  const agents = useProjectAgents(can('ai_agents', 'read'));
  const available =
    agents.data?.filter((agent) => agent.kind === 'internal' && agent.chatEnabled) ?? [];
  const generate = useGeneratePlan(projectRef, draftId);
  const busy = saving || generate.isPending;
  useEffect(() => {
    onPending(generate.isPending);
  }, [generate.isPending, onPending]);
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </span>
        <div>
          <h2 className="font-heading font-semibold">{t('generate')}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">
            {t('generateHelp')}
          </p>
        </div>
      </div>
      {!available.length && <p className="text-sm text-muted-foreground">{t('noProvider')}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-sm font-medium">
          {t('agent')}
          <select
            className="mt-1 block h-10 w-full rounded-md border bg-background px-3"
            value={agentId}
            disabled={busy}
            onChange={(e) => setAgentId(e.target.value)}
          >
            <option value="">{t('chooseAgent')}</option>
            {available.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={!draftId || dirty || !agentId || busy || !can('ai_agents', 'read')}
          onClick={async () => {
            try {
              const result = await generate.mutateAsync({ agentId: Number(agentId), version });
              setPreview(result);
            } catch {
              /* Shared mutation cache reports failures. */
            }
          }}
        >
          <Sparkles />
          {generate.isPending ? t('generating') : t('generate')}
        </Button>
      </div>
      {generate.isError && <p role="alert">{generate.error.message}</p>}
      {preview && (
        <div className="space-y-4 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
          <div>
            <p className="font-heading text-lg font-semibold text-primary">{t('previewTitle')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('preview')}</p>
          </div>
          <PlanningRelevance assessments={preview.sourceAssessments} sources={sources} />
          <PlanningReview plan={preview.content} sources={sources} />
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              onClick={() => {
                if (!dirty || window.confirm(t('replace'))) {
                  onApply(preview.content);
                  setPreview(null);
                }
              }}
            >
              {t('apply')}
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              {t('dismiss')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
