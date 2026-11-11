'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/usePermissions';
import { useLaunchReceipt, useSavePlan } from '@/services/planning.service';
import type { Plan, PlanDraft, PlanSource } from '@/lib/api/endpoints/planning';
import PlanningFields from './PlanningFields';
import PlanningTasks from './PlanningTasks';
import PlanningGeneration from './PlanningGeneration';
import PlanningSources from './PlanningSources';
import PlanningReview from './PlanningReview';
import PlanningHistory from './PlanningHistory';
import PlanningAssignment from './PlanningAssignment';
import PlanningLaunch from './PlanningLaunch';

const empty: Plan = {
  title: '',
  brief: '',
  objectives: [],
  deadline: null,
  assumptions: [],
  questions: [],
  tasks: [],
};
const lines = (items: string[]) => items.map((s) => s.trim()).filter(Boolean);
function normalized(plan: Plan): Plan {
  return {
    ...plan,
    objectives: lines(plan.objectives),
    assumptions: lines(plan.assumptions),
    questions: lines(plan.questions),
    tasks: plan.tasks.map((task) => ({
      ...task,
      acceptanceCriteria: lines(task.acceptanceCriteria),
      requiredSkills: lines(task.requiredSkills),
      dependencyIds: lines(task.dependencyIds),
      sourceRefs: lines(task.sourceRefs),
    })),
  };
}
export default function PlanningEditor({
  projectRef,
  draft,
  canEdit,
  onSaved,
}: {
  projectRef: string;
  draft?: PlanDraft;
  canEdit: boolean;
  onSaved: (id: number) => void;
}) {
  const t = useTranslations('documents.planning');
  const [plan, setPlan] = useState(draft?.content ?? empty);
  const [version, setVersion] = useState(draft?.version ?? 0);
  const [sourceIds, setSourceIds] = useState(draft?.sources.map((s) => s.attachmentId) ?? []);
  const [sources, setSources] = useState<PlanSource[]>(draft?.sources ?? []);
  const [saved, setSaved] = useState(
    JSON.stringify({ content: draft?.content ?? empty, ids: sourceIds }),
  );
  const [generating, setGenerating] = useState(false);
  const save = useSavePlan(projectRef, draft?.id);
  const receipt = useLaunchReceipt(projectRef, draft?.id ?? 0);
  const { isOwner } = usePermissions();
  const dirty = JSON.stringify({ content: normalized(plan), ids: sourceIds }) !== saved;
  const busy = save.isPending || generating;
  const launched = receipt.data?.wbsVersion === version;
  if (!canEdit)
    return (
      <>
        <p>{t('readOnly')}</p>
        <PlanningReview plan={plan} sources={sources} />
        {draft && <PlanningHistory projectRef={projectRef} id={draft.id} />}
      </>
    );
  return (
    <div className="space-y-5">
      <p>
        {t('version', { version })} ·{' '}
        {launched ? t('launchedStatus') : dirty ? t('unsaved') : t('draftStatus')}
      </p>
      <Tabs defaultValue="wbs">
        <TabsList variant="line" className="w-full overflow-x-auto">
          <TabsTrigger value="wbs">{t('tabs.wbs')}</TabsTrigger>
          <TabsTrigger value="assignment" disabled={!draft}>
            {t('tabs.assignment')}
          </TabsTrigger>
          {isOwner && (
            <TabsTrigger value="launch" disabled={!draft}>
              {t('tabs.launch')}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="wbs" className="space-y-5 pt-3">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const result = await save.mutateAsync({
                  content: normalized(plan),
                  attachmentIds: sourceIds,
                  ...(draft ? { version } : {}),
                });
                setPlan(result.content);
                setSources(result.sources);
                setVersion(result.version);
                setSaved(JSON.stringify({ content: result.content, ids: sourceIds }));
                onSaved(result.id);
              } catch {
                /* Shared mutation cache reports failures; retain edits. */
              }
            }}
          >
            <fieldset disabled={busy} className="space-y-5">
              <PlanningFields plan={plan} onChange={setPlan} />
              <PlanningSources
                projectRef={projectRef}
                selected={sourceIds}
                onChange={setSourceIds}
                onUploaded={(source) => setSources((current) => [...current, source])}
              />
              <PlanningTasks tasks={plan.tasks} onChange={(tasks) => setPlan({ ...plan, tasks })} />
              <Button type="submit" className="ms-3">
                {save.isPending ? t('saving') : t('save')}
              </Button>
            </fieldset>
          </form>
          {save.isError && <p role="alert">{save.error.message}</p>}
          <PlanningGeneration
            projectRef={projectRef}
            draftId={draft?.id}
            version={version}
            dirty={dirty}
            sources={sources.filter((s) => sourceIds.includes(s.attachmentId))}
            onApply={setPlan}
            saving={save.isPending}
            onPending={setGenerating}
          />
          <details>
            <summary>{t('sourcePreview')}</summary>
            <PlanningReview
              plan={{ ...empty, title: plan.title }}
              sources={sources.filter((s) => sourceIds.includes(s.attachmentId))}
            />
          </details>
          {draft && <PlanningHistory projectRef={projectRef} id={draft.id} />}
        </TabsContent>
        <TabsContent value="assignment" className="pt-3">
          {draft && (
            <PlanningAssignment
              projectRef={projectRef}
              draftId={draft.id}
              draftVersion={version}
              canEdit={canEdit}
            />
          )}
        </TabsContent>
        {isOwner && (
          <TabsContent value="launch" className="pt-3">
            {draft && (
              <PlanningLaunch projectRef={projectRef} draftId={draft.id} draftVersion={version} />
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
