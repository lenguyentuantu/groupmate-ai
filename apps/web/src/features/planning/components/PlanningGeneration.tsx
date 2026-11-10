'use client';
import { useEffect, useState } from 'react';
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
    <section className="space-y-3 rounded border p-4">
      <h2 className="font-semibold">{t('generate')}</h2>
      <p>{t('generateHelp')}</p>
      {!available.length && <p>{t('noProvider')}</p>}
      <label>
        {t('agent')}
        <select
          className="ms-2 rounded border p-2"
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
        className="ms-3"
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
        {generate.isPending ? t('generating') : t('generate')}
      </Button>
      {generate.isError && <p role="alert">{generate.error.message}</p>}
      {preview && (
        <>
          <p>{t('preview')}</p>
          <PlanningRelevance assessments={preview.sourceAssessments} sources={sources} />
          <PlanningReview plan={preview.content} sources={sources} />
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
        </>
      )}
    </section>
  );
}
