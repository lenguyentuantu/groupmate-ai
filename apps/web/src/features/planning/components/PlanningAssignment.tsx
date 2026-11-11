'use client';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  useAssignmentInputs,
  useAssignmentProposal,
  useGenerateAssignmentProposal,
  useSaveAssignmentProposal,
} from '@/services/planning.service';
import type { PlanningProposal } from '@/lib/api/endpoints/planning';
import { summarizePlanningWarnings } from '@/lib/api/endpoints/planning';
import { useProjectAgents } from '@/hooks/useProjectAgents';
import { usePermissions } from '@/hooks/usePermissions';
import { ApiError } from '@/lib/api/core/client';

export default function PlanningAssignment({
  projectRef,
  draftId,
  draftVersion,
  canEdit,
}: {
  projectRef: string;
  draftId: number;
  draftVersion: number;
  canEdit: boolean;
}) {
  const inputs = useAssignmentInputs(projectRef, draftId);
  const saved = useAssignmentProposal(projectRef, draftId);
  const generate = useGenerateAssignmentProposal(projectRef, draftId);
  const save = useSaveAssignmentProposal(projectRef, draftId);
  const { can } = usePermissions();
  const agents = useProjectAgents(can('ai_agents', 'read'));
  const [agentId, setAgentId] = useState('');
  const [proposal, setProposal] = useState<PlanningProposal | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const current = proposal ?? saved.data;
  const taskNames = useMemo(
    () => new Map(inputs.data?.tasks.map((task) => [task.id, task.title])),
    [inputs.data?.tasks],
  );
  const candidates = current?.candidates ?? inputs.data?.candidates ?? [];
  const provisionalCandidates = candidates.filter((candidate) => !candidate.isRealMember);
  if (inputs.isPending) return <p role="status">Loading assignment inputs…</p>;
  if (inputs.isError) return <p role="alert">{inputs.error.message}</p>;
  if (!inputs.data || !draftId) return null;

  async function generateProposal() {
    try {
      const result = await generate.mutateAsync({
        sourceVersion: draftVersion,
        overrides,
        provisionalCandidates,
        ...(agentId ? { agentId: Number(agentId) } : {}),
      });
      setActionError(null);
      setProposal({
        ...result,
        ...(current
          ? {
              id: current.id,
              draftId: current.draftId,
              version: current.version,
              updatedAt: current.updatedAt,
            }
          : {}),
      });
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Unable to update the proposal.');
    }
  }

  async function saveProposal() {
    if (!current) return;
    try {
      const result = await save.mutateAsync({
        sourceVersion: draftVersion,
        overrides,
        provisionalCandidates,
        proposal: current,
        version: current.version,
      });
      setActionError(null);
      setProposal(result);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Unable to save the proposal.');
    }
  }

  return (
    <section className="space-y-3 rounded border p-4">
      <div>
        <h2 className="font-semibold">Assignment proposal</h2>
        <p className="text-sm text-muted-foreground">
          This is a planning proposal. It does not create work items or change the WBS.
        </p>
      </div>
      {current?.stale && (
        <p role="alert">The source WBS changed. Generate a new proposal before saving.</p>
      )}
      {!current && <p className="text-sm">No proposal generated yet.</p>}
      <label className="block text-sm">
        Optional AI explanation agent
        <select
          className="ms-2 rounded border p-2"
          value={agentId}
          disabled={!canEdit}
          onChange={(event) => setAgentId(event.target.value)}
        >
          <option value="">Rule-based proposal only</option>
          {agents.data
            ?.filter((agent) => agent.kind === 'internal' && agent.chatEnabled)
            .map((agent) => (
              <option value={agent.id} key={agent.id}>
                {agent.name}
              </option>
            ))}
        </select>
      </label>
      {current?.aiEnrichment === 'applied' && (
        <p className="text-sm">AI explanations were validated against the rule-based proposal.</p>
      )}
      {current?.aiEnrichment === 'failed' && (
        <p className="text-sm text-amber-700">
          AI explanation was unavailable. The rule-based proposal is shown for review.
        </p>
      )}
      {actionError && <p role="alert">{actionError}</p>}
      {summarizePlanningWarnings(current?.warnings ?? []).map(({ message, count }) => (
        <p className="text-sm text-amber-700" key={`planning-warning-${message}`}>
          {message}
          {count > 1 ? ` (repeated ${count} times)` : ''}
        </p>
      ))}
      {current && (
        <div className="space-y-2">
          {(current.assignments ?? []).map((assignment) => (
            <div className="rounded border p-3" key={assignment.taskId}>
              <p className="font-medium">{taskNames.get(assignment.taskId) ?? assignment.taskId}</p>
              <select
                className="mt-2 w-full rounded border bg-background p-2"
                value={
                  Object.prototype.hasOwnProperty.call(overrides, assignment.taskId)
                    ? (overrides[assignment.taskId] ?? '')
                    : (assignment.candidateId ?? '')
                }
                disabled={!canEdit}
                onChange={(event) => {
                  setOverrides((currentOverrides) => ({
                    ...currentOverrides,
                    [assignment.taskId]: event.target.value || null,
                  }));
                }}
              >
                <option value="">Unassigned</option>
                {candidates.map((candidate) => (
                  <option value={candidate.id} key={candidate.id}>
                    {candidate.name}
                    {!candidate.isRealMember ? ' (provisional)' : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-muted-foreground">{assignment.reason}</p>
              {assignment.warning && <p className="text-sm text-amber-700">{assignment.warning}</p>}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void generateProposal()}
            disabled={generate.isPending}
          >
            {generate.isPending
              ? 'Generating…'
              : current
                ? 'Recheck proposal'
                : 'Generate proposal'}
          </Button>
          {current && (
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending || current.stale}
              onClick={() => void saveProposal()}
            >
              {save.isPending ? 'Saving…' : 'Save proposal'}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
