'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
import PlanningSourceInspector from './PlanningSourceInspector';
import PlanningWorkspaceHeader from './PlanningWorkspaceHeader';

const WBS_FORM_ID = 'planning-wbs-form';

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
  const [aiApplied, setAiApplied] = useState(false);
  const [requirementsOpen, setRequirementsOpen] = useState(plan.tasks.length === 0);
  const save = useSavePlan(projectRef, draft?.id);
  const receipt = useLaunchReceipt(projectRef, draft?.id ?? 0);
  const { isOwner } = usePermissions();
  const dirty = JSON.stringify({ content: normalized(plan), ids: sourceIds }) !== saved;
  const busy = save.isPending || generating;
  const launched = receipt.data?.wbsVersion === version;
  let status = t('draftStatus');
  let contentStatus = t('userContent');
  if (launched) {
    status = t('launchedStatus');
    contentStatus = t('approvedContent');
  } else if (aiApplied && dirty) {
    status = t('appliedAiStatus');
    contentStatus = t('editedContent');
  } else if (dirty) {
    status = t('unsaved');
    contentStatus = t('editedContent');
  }
  if (!canEdit)
    return (
      <div className="space-y-5">
        <PlanningWorkspaceHeader
          plan={plan}
          version={version}
          status={status}
          contentStatus={contentStatus}
        />
        <p className="rounded-lg bg-muted/45 p-3 text-sm text-muted-foreground">{t('readOnly')}</p>
        <PlanningReview plan={plan} sources={sources} />
        {draft && <PlanningHistory projectRef={projectRef} id={draft.id} />}
      </div>
    );
  return (
    <div className="space-y-5">
      <PlanningWorkspaceHeader
        plan={plan}
        version={version}
        status={status}
        contentStatus={contentStatus}
        saveFormId={WBS_FORM_ID}
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={busy}
        saveError={save.isError ? save.error.message : undefined}
      />
      <Tabs defaultValue="wbs">
        <TabsList
          variant="line"
          className="w-full justify-start overflow-x-auto rounded-xl border bg-background px-2 shadow-xs"
        >
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
          <PlanningGeneration
            projectRef={projectRef}
            draftId={draft?.id}
            version={version}
            dirty={dirty}
            sources={sources.filter((s) => sourceIds.includes(s.attachmentId))}
            onApply={(generatedPlan) => {
              setPlan(generatedPlan);
              setAiApplied(true);
            }}
            saving={save.isPending}
            onPending={setGenerating}
          />
          <form
            id={WBS_FORM_ID}
            className="space-y-5"
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
                setAiApplied(false);
                onSaved(result.id);
              } catch {
                /* Shared mutation cache reports failures; retain edits. */
              }
            }}
          >
            <fieldset disabled={busy} className="space-y-5">
              {plan.tasks.length > 0 && (
                <PlanningTasks
                  tasks={plan.tasks}
                  sources={sources.filter((source) => sourceIds.includes(source.attachmentId))}
                  onChange={(tasks) => setPlan({ ...plan, tasks })}
                />
              )}
              <details
                className="rounded-xl border bg-card px-4 py-3 shadow-xs"
                open={requirementsOpen}
                onToggle={(event) => setRequirementsOpen(event.currentTarget.open)}
              >
                <summary className="cursor-pointer font-heading font-semibold">
                  {t('workflow.sources')}
                </summary>
                <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
                  <PlanningFields plan={plan} onChange={setPlan} />
                  <PlanningSources
                    projectRef={projectRef}
                    selected={sourceIds}
                    onChange={setSourceIds}
                    onUploaded={(source) => setSources((current) => [...current, source])}
                  />
                </div>
              </details>
              {plan.tasks.length === 0 && (
                <PlanningTasks
                  tasks={plan.tasks}
                  sources={sources.filter((source) => sourceIds.includes(source.attachmentId))}
                  onChange={(tasks) => setPlan({ ...plan, tasks })}
                />
              )}
            </fieldset>
          </form>
          <div className="grid gap-3 lg:grid-cols-2">
            <details className="rounded-xl border bg-card px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">{t('sourcePreview')}</summary>
              <div className="mt-3">
                <PlanningSourceInspector
                  sources={sources.filter((source) => sourceIds.includes(source.attachmentId))}
                />
              </div>
            </details>
            {draft && <PlanningHistory projectRef={projectRef} id={draft.id} />}
          </div>
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
