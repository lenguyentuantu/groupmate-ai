import { HttpError } from '#shared/lib';
import {
  assertLaunchCanPublish,
  buildLaunchPreview,
  type BuildLaunchPreviewInput,
  type ExecutionBaseline,
} from './launch';

export interface ApprovalCommand {
  projectId: number;
  draftId: number;
  actorUserId: string;
  wbsVersion: number;
  proposalVersion: number;
  intentId: string;
  acknowledgedRiskCodes: string[];
}

export interface WorkItemMapping {
  sourceTaskId: string;
  workItemId: number;
  sequenceNumber: number;
  dependencyWorkItemIds: number[];
}

export interface PublishedWorkItem {
  sourceTaskId: string;
  workItemId: number;
  sequenceNumber: number;
}

export function buildWorkItemDescription(task: ExecutionBaseline['tasks'][number]) {
  const sections = [task.description.trim()];
  if (task.deliverable.trim()) sections.push(`## Deliverable\n${task.deliverable.trim()}`);
  if (task.acceptanceCriteria.length)
    sections.push(
      `## Acceptance criteria\n${task.acceptanceCriteria.map((criterion) => `- ${criterion}`).join('\n')}`,
    );
  if (task.requiredSkills.length)
    sections.push(`## Required skills\n${task.requiredSkills.join(', ')}`);
  sections.push(
    `## Planning source\nWBS task: ${task.sourceTaskId}\nWork package: ${task.workPackageId ?? 'standalone'}\nSource references: ${task.sourceRefs.join(', ') || 'none'}`,
  );
  return sections.filter(Boolean).join('\n\n');
}

export function mapPublishedWorkItems(baseline: ExecutionBaseline, published: PublishedWorkItem[]) {
  const byTask = new Map(published.map((item) => [item.sourceTaskId, item]));
  if (published.length !== baseline.tasks.length || byTask.size !== published.length)
    throw new HttpError(
      500,
      'Work Item materialization was incomplete.',
      'P4_MATERIALIZATION_FAILED',
    );

  const dependencyLinks = baseline.tasks.flatMap((task) =>
    task.dependencyTaskIds.map((dependencyTaskId) => {
      const dependency = byTask.get(dependencyTaskId);
      const target = byTask.get(task.sourceTaskId);
      if (!dependency || !target)
        throw new HttpError(409, 'Invalid baseline dependency mapping.', 'P4_BLOCKED');
      return {
        sourceIssueId: dependency.workItemId,
        targetIssueId: target.workItemId,
        kind: 'blocks' as const,
      };
    }),
  );
  const workItemMappings: WorkItemMapping[] = baseline.tasks.map((task) => {
    const created = byTask.get(task.sourceTaskId)!;
    return {
      sourceTaskId: task.sourceTaskId,
      workItemId: created.workItemId,
      sequenceNumber: created.sequenceNumber,
      dependencyWorkItemIds: task.dependencyTaskIds.map(
        (dependencyTaskId) => byTask.get(dependencyTaskId)!.workItemId,
      ),
    };
  });
  return { dependencyLinks, workItemMappings };
}

export interface ApprovalReceipt {
  id: number;
  projectId: number;
  draftId: number;
  wbsVersion: number;
  proposalId: number;
  proposalVersion: number;
  intentId: string;
  approvedByUserId: string;
  approvedByUserName: string;
  approvedAt: string;
  acknowledgedRiskCodes: string[];
  baseline: ExecutionBaseline;
  workItemMappings: WorkItemMapping[];
}

export interface ApprovalTransaction {
  loadState(command: ApprovalCommand): Promise<
    | (BuildLaunchPreviewInput & {
        actorIsApprover: boolean;
      })
    | null
  >;
  findReceipt(command: ApprovalCommand): Promise<ApprovalReceipt | null>;
  materialize(baseline: ExecutionBaseline, actorUserId: string): Promise<WorkItemMapping[]>;
  saveReceipt(input: {
    command: ApprovalCommand;
    baseline: ExecutionBaseline;
    proposalId: number;
    workItemMappings: WorkItemMapping[];
  }): Promise<ApprovalReceipt>;
}

export interface ApprovalStore {
  transaction<T>(operation: (tx: ApprovalTransaction) => Promise<T>): Promise<T>;
}

export async function approveAndPublish(
  store: ApprovalStore,
  command: ApprovalCommand,
): Promise<ApprovalReceipt> {
  return store.transaction(async (tx) => {
    const state = await tx.loadState(command);
    if (!state) throw new HttpError(404, 'Planning draft not found');
    if (!state.actorIsApprover)
      throw new HttpError(403, 'Only a project owner can approve a launch.', 'P4_FORBIDDEN');

    const existing = await tx.findReceipt(command);
    if (existing) {
      const existingAcknowledgments = [...existing.acknowledgedRiskCodes].sort().join('\n');
      const requestedAcknowledgments = [...new Set(command.acknowledgedRiskCodes)]
        .sort()
        .join('\n');
      if (
        existing.intentId === command.intentId &&
        existing.proposalVersion === command.proposalVersion &&
        existing.approvedByUserId === command.actorUserId &&
        existingAcknowledgments === requestedAcknowledgments
      )
        return existing;
      throw new HttpError(
        409,
        'This WBS revision already has a different launch approval.',
        'P4_APPROVAL_CONFLICT',
      );
    }

    if (
      state.draft.version !== command.wbsVersion ||
      !state.proposal ||
      state.proposal.version !== command.proposalVersion ||
      state.proposal.sourceVersion !== command.wbsVersion
    )
      throw new HttpError(
        409,
        'The WBS or assignment proposal changed. Reopen the launch preview.',
        'P4_STALE_SOURCE',
      );

    const preview = buildLaunchPreview(state);
    assertLaunchCanPublish(preview, command.acknowledgedRiskCodes);
    if (!preview.baseline || !state.proposal)
      throw new HttpError(409, 'Launch baseline is unavailable.', 'P4_BLOCKED');

    const workItemMappings = await tx.materialize(preview.baseline, command.actorUserId);
    return tx.saveReceipt({
      command,
      baseline: preview.baseline,
      proposalId: state.proposal.id,
      workItemMappings,
    });
  });
}
