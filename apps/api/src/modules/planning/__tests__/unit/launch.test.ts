import { describe, expect, it } from 'bun:test';
import { HttpError } from '#shared/lib';
import {
  approveAndPublish,
  buildWorkItemDescription,
  mapPublishedWorkItems,
  type ApprovalCommand,
  type ApprovalReceipt,
  type ApprovalStore,
  type ApprovalTransaction,
} from '../../approval';
import { buildLaunchPreview, type BuildLaunchPreviewInput } from '../../launch';
import type { Plan } from '../../validation';

const member = {
  id: 'user-1',
  name: 'Leader',
  skills: ['Backend'],
  weeklyCapacityMinutes: 2400,
  knownWorkloadMinutes: 0,
  unknownWorkloadTasks: 0,
};

function task(id: string, overrides: Partial<Plan['tasks'][number]> = {}): Plan['tasks'][number] {
  return {
    id,
    title: `Task ${id}`,
    description: `Description ${id}`,
    deliverable: `Deliverable ${id}`,
    acceptanceCriteria: [`Accept ${id}`],
    priority: 'high',
    requiredSkills: ['Backend'],
    estimateMinutes: 60,
    dependencyIds: [],
    sourceRefs: ['brief'],
    parentId: null,
    ...overrides,
  };
}

function state(tasks: Plan['tasks'] = [task('TASK-1'), task('TASK-2')]): BuildLaunchPreviewInput {
  const plan: Plan = {
    title: 'Project',
    brief: 'Build the project.',
    objectives: ['Deliver the project'],
    deadline: '2027-01-31',
    assumptions: [],
    questions: [],
    tasks,
  };
  const actionable = tasks.filter(
    (candidate) =>
      candidate.parentId !== null || !tasks.some((child) => child.parentId === candidate.id),
  );
  return {
    project: { id: 1, teamId: 2, key: 'PROJ', name: 'Project' },
    draft: { id: 10, projectId: 1, version: 3, content: plan, sources: [] },
    proposal: {
      id: 20,
      draftId: 10,
      sourceVersion: 3,
      version: 4,
      content: {
        sourceVersion: 3,
        candidates: [{ ...member, isRealMember: true }],
        assignments: actionable.map((candidate) => ({
          taskId: candidate.id,
          candidateId: member.id,
          matchingSkills: ['Backend'],
          missingSkills: [],
          reason: 'Matches the required skill.',
          warning: null,
          allocatedMinutes: candidate.estimateMinutes ?? 0,
          remainingCapacityMinutes: 2000,
        })),
        schedule: actionable.map((candidate, index) => ({
          taskId: candidate.id,
          order: index + 1,
          relativeWeek: 1,
          dependencyTaskIds: candidate.dependencyIds,
          canRunInParallel: candidate.dependencyIds.length === 0,
        })),
        warnings: [],
      },
    },
    members: [member],
    hasPublishColumn: true,
    publishCapacityAvailable: true,
  };
}

function issueCodes(input: BuildLaunchPreviewInput) {
  const preview = buildLaunchPreview(input);
  return {
    preview,
    blockers: preview.blockers.map((item) => item.code),
    risks: preview.risks.map((item) => item.code),
  };
}

function proposalContent(input: BuildLaunchPreviewInput) {
  return input.proposal!.content as {
    candidates: { id: string; isRealMember: boolean }[];
    assignments: { candidateId: string | null }[];
  };
}

describe('P4 launch readiness', () => {
  it('marks a valid small project ready and preserves baseline fields', () => {
    const { preview } = issueCodes(state());
    expect(preview.status).toBe('ready');
    expect(preview.summary).toMatchObject({
      actionableTaskCount: 2,
      knownEffortMinutes: 120,
      unknownEstimateTaskCount: 0,
    });
    expect(preview.baseline?.tasks[0]).toMatchObject({
      sourceTaskId: 'TASK-1',
      deliverable: 'Deliverable TASK-1',
      acceptanceCriteria: ['Accept TASK-1'],
      priority: 'high',
      assigneeUserId: 'user-1',
    });
  });

  it('reports missing skills and unknown capacity without treating them as zero', () => {
    const input = state();
    input.members[0] = { ...member, skills: [], weeklyCapacityMinutes: null };
    const { preview, risks } = issueCodes(input);
    expect(preview.status).toBe('needs_review');
    expect(risks).toContain('MISSING_SKILLS');
    expect(risks).toContain('UNKNOWN_CAPACITY');
    expect(preview.summary.knownAllocations[0].minutes).toBe(120);
  });

  it('allows an unassigned backlog only as an acknowledged risk', () => {
    const input = state();
    proposalContent(input).assignments[0].candidateId = null;
    const { preview, risks } = issueCodes(input);
    expect(preview.status).toBe('needs_review');
    expect(risks).toContain('UNASSIGNED_TASKS');
    expect(preview.baseline?.tasks[0].assigneeUserId).toBeNull();
  });

  it('blocks provisional and cross-project assignees', () => {
    const provisional = state();
    const content = proposalContent(provisional);
    content.candidates[0] = {
      ...content.candidates[0],
      id: 'provisional:backend',
      isRealMember: false,
    };
    content.assignments[0].candidateId = 'provisional:backend';
    expect(issueCodes(provisional).blockers).toContain('PROVISIONAL_ASSIGNMENT');

    const crossProject = state();
    crossProject.members = [];
    expect(issueCodes(crossProject).blockers).toContain('INVALID_ASSIGNEE');
  });

  it('blocks stale proposals and invalid or cyclic WBS dependencies', () => {
    const stale = state();
    stale.proposal!.sourceVersion = 2;
    expect(issueCodes(stale).blockers).toContain('PROPOSAL_STALE');

    const invalid = state([task('A', { dependencyIds: ['missing'] })]);
    expect(issueCodes(invalid).blockers).toContain('WBS_INVALID');
    const cyclic = state([
      task('A', { dependencyIds: ['B'] }),
      task('B', { dependencyIds: ['A'] }),
    ]);
    expect(issueCodes(cyclic).blockers).toContain('WBS_INVALID');
  });

  it('derives dependency phases, parallel work, and blocking links', () => {
    const input = state([task('A'), task('B'), task('C', { dependencyIds: ['A', 'B'] })]);
    const baseline = buildLaunchPreview(input).baseline!;
    expect(baseline.execution.readyTaskIds).toEqual(['A', 'B']);
    expect(baseline.execution.parallelTaskGroups).toEqual([['A', 'B']]);
    expect(baseline.execution.phases).toEqual([
      { order: 1, taskIds: ['A', 'B'] },
      { order: 2, taskIds: ['C'] },
    ]);
    expect(baseline.tasks.find((item) => item.sourceTaskId === 'C')?.dependencyTaskIds).toEqual([
      'A',
      'B',
    ]);
  });

  it('excludes six aggregate parents and publishes eighteen actionable children', () => {
    const tasks = Array.from({ length: 6 }, (_, group) => {
      const parentId = `WP-${group + 1}`;
      return [
        task(parentId, { estimateMinutes: null }),
        ...Array.from({ length: 3 }, (_, child) => task(`${parentId}-${child + 1}`, { parentId })),
      ];
    }).flat();
    const preview = buildLaunchPreview(state(tasks));
    expect(preview.summary).toMatchObject({
      aggregateWorkPackageCount: 6,
      actionableTaskCount: 18,
      knownEffortMinutes: 1080,
    });
    expect(preview.baseline?.tasks).toHaveLength(18);
    expect(preview.baseline?.workPackages).toHaveLength(6);
  });

  it('keeps a standalone root actionable and expands aggregate dependencies to children', () => {
    const input = state([
      task('WP-A', { estimateMinutes: null }),
      task('A-1', { parentId: 'WP-A' }),
      task('A-2', { parentId: 'WP-A' }),
      task('ROOT', { dependencyIds: ['WP-A'] }),
    ]);
    const preview = buildLaunchPreview(input);
    expect(preview.summary.actionableTaskCount).toBe(3);
    expect(
      preview.baseline?.tasks.find((item) => item.sourceTaskId === 'ROOT')?.dependencyTaskIds,
    ).toEqual(['A-1', 'A-2']);
  });

  it('reports unknown estimates and workload as distinct review risks', () => {
    const input = state([task('A', { estimateMinutes: null })]);
    input.members[0] = { ...member, unknownWorkloadTasks: 1 };
    const { preview, risks } = issueCodes(input);
    expect(risks).toContain('UNKNOWN_ESTIMATES');
    expect(risks).toContain('UNKNOWN_WORKLOAD');
    expect(preview.summary.knownEffortMinutes).toBe(0);
    expect(preview.summary.unknownEstimateTaskCount).toBe(1);
  });

  it('reports known capacity overload and blocks an unavailable publish column', () => {
    const overloaded = state();
    overloaded.members[0] = {
      ...member,
      weeklyCapacityMinutes: 100,
      knownWorkloadMinutes: 50,
    };
    expect(issueCodes(overloaded).risks).toContain('CAPACITY_OVERLOAD');

    const fullColumn = state();
    fullColumn.publishCapacityAvailable = false;
    expect(issueCodes(fullColumn).blockers).toContain('PUBLISH_COLUMN_WIP_LIMIT');
  });

  it('blocks a WBS without executable tasks', () => {
    expect(issueCodes(state([])).blockers).toContain('NO_ACTIONABLE_TASKS');
  });

  it('maps dependencies and durable WBS details into publishable Work Item data', () => {
    const baseline = buildLaunchPreview(
      state([task('A'), task('B', { dependencyIds: ['A'] })]),
    ).baseline!;
    const mapped = mapPublishedWorkItems(baseline, [
      { sourceTaskId: 'A', workItemId: 100, sequenceNumber: 1 },
      { sourceTaskId: 'B', workItemId: 101, sequenceNumber: 2 },
    ]);
    expect(mapped.dependencyLinks).toEqual([
      { sourceIssueId: 100, targetIssueId: 101, kind: 'blocks' },
    ]);
    expect(mapped.workItemMappings[1].dependencyWorkItemIds).toEqual([100]);
    const description = buildWorkItemDescription(baseline.tasks[0]);
    expect(description).toContain('## Deliverable\nDeliverable A');
    expect(description).toContain('## Acceptance criteria\n- Accept A');
    expect(description).toContain('WBS task: A');
  });
});

class FakeStore implements ApprovalStore {
  state: BuildLaunchPreviewInput & { actorIsApprover: boolean };
  receipt: ApprovalReceipt | null = null;
  publishedCount = 0;
  failMaterialization = false;
  private tail = Promise.resolve();

  constructor(input = state()) {
    this.state = { ...input, actorIsApprover: true };
  }

  async transaction<T>(operation: (tx: ApprovalTransaction) => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const snapshot = { receipt: this.receipt, publishedCount: this.publishedCount };
    try {
      return await operation({
        loadState: async () => this.state,
        findReceipt: async () => this.receipt,
        materialize: async (baseline) => {
          this.publishedCount += baseline.tasks.length;
          if (this.failMaterialization) throw new Error('mid-batch failure');
          return baseline.tasks.map((item, index) => ({
            sourceTaskId: item.sourceTaskId,
            workItemId: index + 100,
            sequenceNumber: index + 1,
            dependencyWorkItemIds: item.dependencyTaskIds.map(
              (dependencyId) =>
                baseline.tasks.findIndex((candidate) => candidate.sourceTaskId === dependencyId) +
                100,
            ),
          }));
        },
        saveReceipt: async ({ command, baseline, proposalId, workItemMappings }) => {
          this.receipt = {
            id: 1,
            projectId: command.projectId,
            draftId: command.draftId,
            wbsVersion: command.wbsVersion,
            proposalId,
            proposalVersion: command.proposalVersion,
            intentId: command.intentId,
            approvedByUserId: command.actorUserId,
            approvedByUserName: 'Project Owner',
            approvedAt: '2026-11-11T00:00:00.000Z',
            acknowledgedRiskCodes: command.acknowledgedRiskCodes,
            baseline,
            workItemMappings,
          };
          return this.receipt;
        },
      });
    } catch (error) {
      this.receipt = snapshot.receipt;
      this.publishedCount = snapshot.publishedCount;
      throw error;
    } finally {
      release();
    }
  }
}

const command: ApprovalCommand = {
  projectId: 1,
  draftId: 10,
  actorUserId: 'user-1',
  wbsVersion: 3,
  proposalVersion: 4,
  intentId: '11111111-1111-4111-8111-111111111111',
  acknowledgedRiskCodes: [],
};

async function errorCode(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof HttpError ? error.code : 'unknown';
  }
}

describe('P4 approval orchestration', () => {
  it('accepts an authorized owner and preserves real and null assignees', async () => {
    const input = state();
    proposalContent(input).assignments[1].candidateId = null;
    const store = new FakeStore(input);
    const receipt = await approveAndPublish(store, {
      ...command,
      acknowledgedRiskCodes: ['UNASSIGNED_TASKS'],
    });
    expect(receipt.workItemMappings).toHaveLength(2);
    expect(receipt.baseline.tasks.map((item) => item.assigneeUserId)).toEqual(['user-1', null]);
  });

  it('rejects unauthorized, cross-project, provisional, unacknowledged, and stale approvals', async () => {
    const unauthorized = new FakeStore();
    unauthorized.state.actorIsApprover = false;
    expect(await errorCode(approveAndPublish(unauthorized, command))).toBe('P4_FORBIDDEN');

    const crossProject = new FakeStore();
    crossProject.state.members = [];
    expect(await errorCode(approveAndPublish(crossProject, command))).toBe('P4_BLOCKED');

    const provisionalInput = state();
    const content = proposalContent(provisionalInput);
    content.candidates[0] = {
      ...content.candidates[0],
      id: 'provisional:one',
      isRealMember: false,
    };
    content.assignments[0].candidateId = 'provisional:one';
    expect(await errorCode(approveAndPublish(new FakeStore(provisionalInput), command))).toBe(
      'P4_BLOCKED',
    );

    const unassignedInput = state();
    proposalContent(unassignedInput).assignments[0].candidateId = null;
    expect(await errorCode(approveAndPublish(new FakeStore(unassignedInput), command))).toBe(
      'P4_ACKNOWLEDGMENT_REQUIRED',
    );

    const stale = new FakeStore();
    stale.state.draft.version = 5;
    expect(await errorCode(approveAndPublish(stale, command))).toBe('P4_STALE_SOURCE');
  });

  it('returns the same receipt for a retry and publishes only one concurrent set', async () => {
    const store = new FakeStore();
    const [first, second] = await Promise.all([
      approveAndPublish(store, command),
      approveAndPublish(store, command),
    ]);
    expect(first.id).toBe(second.id);
    expect(store.publishedCount).toBe(2);
  });

  it('rejects another intent or proposal for the same WBS revision', async () => {
    const store = new FakeStore();
    await approveAndPublish(store, command);
    expect(
      await errorCode(
        approveAndPublish(store, {
          ...command,
          intentId: '22222222-2222-4222-8222-222222222222',
        }),
      ),
    ).toBe('P4_APPROVAL_CONFLICT');
    expect(await errorCode(approveAndPublish(store, { ...command, proposalVersion: 5 }))).toBe(
      'P4_APPROVAL_CONFLICT',
    );
    expect(store.publishedCount).toBe(2);
  });

  it('rolls back the whole fake transaction after a mid-batch failure', async () => {
    const store = new FakeStore();
    store.failMaterialization = true;
    expect(await errorCode(approveAndPublish(store, command))).toBe('unknown');
    expect(store.publishedCount).toBe(0);
    expect(store.receipt).toBeNull();
  });
});
