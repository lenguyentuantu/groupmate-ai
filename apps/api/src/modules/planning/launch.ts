import { z } from 'zod';
import { HttpError } from '#shared/lib';
import { validatePlan, type Plan, type PlanSource } from './validation';
import { normalizeSkill } from './assignment';

export type ReadinessStatus = 'blocked' | 'needs_review' | 'ready';
export type ReadinessSeverity = 'blocker' | 'risk';

export interface ReadinessIssue {
  code: string;
  severity: ReadinessSeverity;
  affectedTaskIds: string[];
  explanation: string;
  nextAction: string;
}

export interface LaunchMember {
  id: string;
  name: string;
  skills: string[];
  weeklyCapacityMinutes: number | null;
  knownWorkloadMinutes: number | null;
  unknownWorkloadTasks: number;
}

export interface LaunchProject {
  id: number;
  teamId: number;
  key: string;
  name: string;
}

export interface LaunchDraft {
  id: number;
  projectId: number;
  version: number;
  content: unknown;
  sources: PlanSource[];
}

export interface LaunchProposal {
  id: number;
  draftId: number;
  sourceVersion: number;
  version: number;
  content: unknown;
}

const candidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  isRealMember: z.boolean(),
  skills: z.array(z.string()),
  weeklyCapacityMinutes: z.number().nullable(),
  knownWorkloadMinutes: z.number().nullable(),
  unknownWorkloadTasks: z.number().int().nonnegative(),
});

const assignmentSchema = z.object({
  taskId: z.string(),
  candidateId: z.string().nullable(),
  matchingSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  reason: z.string(),
  warning: z.string().nullable(),
  allocatedMinutes: z.number().nonnegative(),
  remainingCapacityMinutes: z.number().nullable(),
});

const scheduleSchema = z.object({
  taskId: z.string(),
  order: z.number().int().positive(),
  relativeWeek: z.number().int().positive().nullable(),
  dependencyTaskIds: z.array(z.string()),
  canRunInParallel: z.boolean(),
});

const proposalContentSchema = z.object({
  sourceVersion: z.number().int().positive(),
  candidates: z.array(candidateSchema),
  assignments: z.array(assignmentSchema),
  schedule: z.array(scheduleSchema),
  warnings: z.array(z.string()),
});

type ProposalContent = z.infer<typeof proposalContentSchema>;

export interface ExecutionBaselineTask {
  sourceTaskId: string;
  workPackageId: string | null;
  title: string;
  description: string;
  priority: Plan['tasks'][number]['priority'];
  estimateMinutes: number | null;
  deliverable: string;
  acceptanceCriteria: string[];
  requiredSkills: string[];
  sourceRefs: string[];
  assigneeUserId: string | null;
  dependencyTaskIds: string[];
  relativeWeek: number | null;
}

export interface ExecutionBaseline {
  project: LaunchProject;
  source: {
    draftId: number;
    wbsVersion: number;
    proposalId: number;
    proposalVersion: number;
  };
  title: string;
  deadline: string | null;
  assumptions: string[];
  readinessRisks: ReadinessIssue[];
  workPackages: {
    sourceTaskId: string;
    title: string;
    deliverable: string;
    actionableTaskIds: string[];
  }[];
  tasks: ExecutionBaselineTask[];
  execution: {
    readyTaskIds: string[];
    phases: { order: number; taskIds: string[] }[];
    parallelTaskGroups: string[][];
    bottleneckTaskIds: string[];
  };
  checkpoints: {
    sourceWorkPackageId: string;
    title: string;
    deliverable: string;
    taskIds: string[];
  }[];
  mappingStrategy: string;
}

export interface LaunchPreview {
  status: ReadinessStatus;
  blockers: ReadinessIssue[];
  risks: ReadinessIssue[];
  recommendations: { issueCode: string; action: string; affectedTaskIds: string[] }[];
  source: ExecutionBaseline['source'] | null;
  summary: {
    actionableTaskCount: number;
    aggregateWorkPackageCount: number;
    assignedTaskCount: number;
    unassignedTaskCount: number;
    knownEffortMinutes: number;
    unknownEstimateTaskCount: number;
    knownAllocations: {
      memberId: string;
      memberName: string;
      minutes: number;
      unknownEstimateTaskCount: number;
      weeklyCapacityMinutes: number | null;
      existingKnownWorkloadMinutes: number | null;
      unknownWorkloadTasks: number;
    }[];
    credibleExecutionPlan: boolean;
  };
  baseline: ExecutionBaseline | null;
}

export interface BuildLaunchPreviewInput {
  project: LaunchProject;
  draft: LaunchDraft;
  proposal: LaunchProposal | null;
  members: LaunchMember[];
  hasPublishColumn: boolean;
  publishCapacityAvailable: boolean;
}

function actionableTasks(tasks: Plan['tasks']) {
  const parentIds = new Set(tasks.filter((task) => task.parentId).map((task) => task.parentId!));
  return tasks.filter((task) => task.parentId !== null || !parentIds.has(task.id));
}

function resolvedDependencies(tasks: Plan['tasks'], actionableIds: Set<string>) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const children = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.parentId)
      children.set(task.parentId, [...(children.get(task.parentId) ?? []), task.id]);
  }
  const expand = (id: string) => (children.has(id) ? (children.get(id) ?? []) : [id]);
  return new Map(
    tasks
      .filter((task) => actionableIds.has(task.id))
      .map((task) => {
        const inherited = task.parentId ? (byId.get(task.parentId)?.dependencyIds ?? []) : [];
        const dependencies = [
          ...new Set([...inherited, ...task.dependencyIds].flatMap(expand)),
        ].filter((id) => actionableIds.has(id) && id !== task.id);
        return [task.id, dependencies] as const;
      }),
  );
}

function executionPhases(taskIds: string[], dependencies: Map<string, string[]>) {
  const remaining = new Set(taskIds);
  const completed = new Set<string>();
  const phases: { order: number; taskIds: string[] }[] = [];
  while (remaining.size) {
    const ready = [...remaining]
      .filter((id) => (dependencies.get(id) ?? []).every((dependency) => completed.has(dependency)))
      .sort();
    if (!ready.length) throw new HttpError(400, 'Dependency cycle detected');
    phases.push({ order: phases.length + 1, taskIds: ready });
    for (const id of ready) {
      remaining.delete(id);
      completed.add(id);
    }
  }
  return phases;
}

function issue(
  code: string,
  severity: ReadinessSeverity,
  taskIds: Iterable<string>,
  explanation: string,
  nextAction: string,
): ReadinessIssue {
  return {
    code,
    severity,
    affectedTaskIds: [...new Set(taskIds)].sort(),
    explanation,
    nextAction,
  };
}

function emptyPreview(blocker: ReadinessIssue): LaunchPreview {
  return {
    status: 'blocked',
    blockers: [blocker],
    risks: [],
    recommendations: [
      {
        issueCode: blocker.code,
        action: blocker.nextAction,
        affectedTaskIds: blocker.affectedTaskIds,
      },
    ],
    source: null,
    summary: {
      actionableTaskCount: 0,
      aggregateWorkPackageCount: 0,
      assignedTaskCount: 0,
      unassignedTaskCount: 0,
      knownEffortMinutes: 0,
      unknownEstimateTaskCount: 0,
      knownAllocations: [],
      credibleExecutionPlan: false,
    },
    baseline: null,
  };
}

export function buildLaunchPreview(input: BuildLaunchPreviewInput): LaunchPreview {
  if (input.draft.projectId !== input.project.id)
    return emptyPreview(
      issue(
        'SOURCE_PROJECT_MISMATCH',
        'blocker',
        [],
        'The WBS draft does not belong to this project.',
        'Open the Planning draft from the intended project.',
      ),
    );

  let plan: Plan;
  try {
    plan = validatePlan(input.draft.content, input.draft.sources);
  } catch {
    return emptyPreview(
      issue(
        'WBS_INVALID',
        'blocker',
        [],
        'The saved WBS no longer satisfies the Planning integrity rules.',
        'Repair and save a valid WBS revision before launch.',
      ),
    );
  }

  if (!input.proposal)
    return emptyPreview(
      issue(
        'PROPOSAL_MISSING',
        'blocker',
        [],
        'No saved assignment proposal exists for this WBS.',
        'Save an assignment proposal before launch.',
      ),
    );
  if (input.proposal.draftId !== input.draft.id)
    return emptyPreview(
      issue(
        'PROPOSAL_DRAFT_MISMATCH',
        'blocker',
        [],
        'The assignment proposal does not belong to this WBS draft.',
        'Open the proposal saved for this Planning draft.',
      ),
    );

  const parsedProposal = proposalContentSchema.safeParse(input.proposal.content);
  if (!parsedProposal.success)
    return emptyPreview(
      issue(
        'PROPOSAL_INVALID',
        'blocker',
        [],
        'The saved assignment proposal is incomplete or invalid.',
        'Regenerate and save the assignment proposal.',
      ),
    );

  const proposal = parsedProposal.data;
  const actionable = actionableTasks(plan.tasks);
  const actionableIds = new Set(actionable.map((task) => task.id));
  const aggregateIds = new Set(
    plan.tasks.filter((task) => !actionableIds.has(task.id)).map((task) => task.id),
  );
  const dependencies = resolvedDependencies(plan.tasks, actionableIds);
  let phases: { order: number; taskIds: string[] }[];
  try {
    phases = executionPhases([...actionableIds], dependencies);
  } catch {
    return emptyPreview(
      issue(
        'DEPENDENCY_CYCLE',
        'blocker',
        actionableIds,
        'The actionable dependency graph contains a cycle.',
        'Remove the circular WBS dependency before launch.',
      ),
    );
  }

  const blockers: ReadinessIssue[] = [];
  const risks: ReadinessIssue[] = [];
  if (!actionable.length)
    blockers.push(
      issue(
        'NO_ACTIONABLE_TASKS',
        'blocker',
        [],
        'The WBS contains no actionable leaf or standalone task to publish.',
        'Add at least one executable task before launch.',
      ),
    );
  if (
    input.proposal.sourceVersion !== input.draft.version ||
    proposal.sourceVersion !== input.draft.version
  )
    blockers.push(
      issue(
        'PROPOSAL_STALE',
        'blocker',
        actionableIds,
        'The saved proposal was created from a different WBS version.',
        'Regenerate and save the proposal from the current WBS revision.',
      ),
    );
  if (!input.hasPublishColumn)
    blockers.push(
      issue(
        'PUBLISH_COLUMN_MISSING',
        'blocker',
        [],
        'The project has no backlog or unstarted column for published Work Items.',
        'Create a backlog or unstarted column before launch.',
      ),
    );
  else if (!input.publishCapacityAvailable)
    blockers.push(
      issue(
        'PUBLISH_COLUMN_WIP_LIMIT',
        'blocker',
        actionableIds,
        'Publishing all actionable tasks would exceed the hard WIP limit of the launch column.',
        'Increase the column limit or free capacity before launch.',
      ),
    );

  const candidates = new Map(proposal.candidates.map((candidate) => [candidate.id, candidate]));
  const members = new Map(input.members.map((member) => [member.id, member]));
  const assignments = new Map<string, ProposalContent['assignments'][number]>();
  const duplicateAssignmentIds = new Set<string>();
  for (const assignment of proposal.assignments) {
    if (assignments.has(assignment.taskId)) duplicateAssignmentIds.add(assignment.taskId);
    assignments.set(assignment.taskId, assignment);
  }
  const invalidTaskIds = proposal.assignments
    .map((assignment) => assignment.taskId)
    .filter((taskId) => !actionableIds.has(taskId));
  const missingTaskIds = actionable
    .filter((task) => !assignments.has(task.id))
    .map((task) => task.id);
  if (duplicateAssignmentIds.size || invalidTaskIds.length || missingTaskIds.length)
    blockers.push(
      issue(
        'PROPOSAL_TASK_MISMATCH',
        'blocker',
        [...duplicateAssignmentIds, ...invalidTaskIds, ...missingTaskIds],
        'The proposal assignments do not exactly match the actionable WBS tasks.',
        'Regenerate and save a complete proposal from the current WBS.',
      ),
    );

  const unassigned: string[] = [];
  const provisional: string[] = [];
  const invalidAssignees: string[] = [];
  const missingSkills: string[] = [];
  const assignedMemberIds = new Set<string>();
  const allocation = new Map<string, { minutes: number; unknown: number }>();
  const scheduleByTask = new Map(proposal.schedule.map((entry) => [entry.taskId, entry]));
  const scheduleTaskIds = proposal.schedule.map((entry) => entry.taskId);
  if (
    new Set(scheduleTaskIds).size !== scheduleTaskIds.length ||
    scheduleTaskIds.some((taskId) => !actionableIds.has(taskId)) ||
    actionable.some((task) => !scheduleByTask.has(task.id))
  )
    blockers.push(
      issue(
        'PROPOSAL_SCHEDULE_MISMATCH',
        'blocker',
        scheduleTaskIds,
        'The saved proposal schedule does not exactly match the actionable WBS tasks.',
        'Regenerate and save the assignment proposal.',
      ),
    );

  for (const task of actionable) {
    const assignment = assignments.get(task.id);
    if (!assignment) continue;
    if (assignment.candidateId === null) {
      unassigned.push(task.id);
      continue;
    }
    const candidate = candidates.get(assignment.candidateId);
    if (!candidate) {
      invalidAssignees.push(task.id);
      continue;
    }
    if (!candidate.isRealMember || candidate.id.startsWith('provisional:')) {
      provisional.push(task.id);
      continue;
    }
    const member = members.get(candidate.id);
    if (!member) {
      invalidAssignees.push(task.id);
      continue;
    }
    assignedMemberIds.add(member.id);
    const memberSkills = new Set(member.skills.map(normalizeSkill));
    if (task.requiredSkills.some((skill) => !memberSkills.has(normalizeSkill(skill))))
      missingSkills.push(task.id);
    const current = allocation.get(member.id) ?? { minutes: 0, unknown: 0 };
    if (task.estimateMinutes === null) current.unknown++;
    else current.minutes += task.estimateMinutes;
    allocation.set(member.id, current);
  }

  if (provisional.length)
    blockers.push(
      issue(
        'PROVISIONAL_ASSIGNMENT',
        'blocker',
        provisional,
        'One or more tasks are assigned to provisional candidates.',
        'Replace each provisional candidate with a current project member or save it as Unassigned.',
      ),
    );
  if (invalidAssignees.length)
    blockers.push(
      issue(
        'INVALID_ASSIGNEE',
        'blocker',
        invalidAssignees,
        'One or more assignees are not current authorized members of this project.',
        'Remove the forged or unavailable assignee before launch.',
      ),
    );
  if (unassigned.length)
    risks.push(
      issue(
        'UNASSIGNED_TASKS',
        'risk',
        unassigned,
        `${unassigned.length} actionable task(s) will enter the backlog without an assignee.`,
        'Acknowledge the unassigned backlog or assign current project members.',
      ),
    );
  if (missingSkills.length)
    risks.push(
      issue(
        'MISSING_SKILLS',
        'risk',
        missingSkills,
        'Some assigned members do not have every required skill documented in their team profile.',
        'Review the assignment or update verified member skills.',
      ),
    );

  const unknownEstimateIds = actionable
    .filter((task) => task.estimateMinutes === null)
    .map((task) => task.id);
  if (unknownEstimateIds.length)
    risks.push(
      issue(
        'UNKNOWN_ESTIMATES',
        'risk',
        unknownEstimateIds,
        'Known effort is only a partial subtotal because some actionable tasks have no estimate.',
        'Confirm the missing estimates before committing to a completion date.',
      ),
    );

  const unknownCapacityTasks: string[] = [];
  const unknownWorkloadTasks: string[] = [];
  const overloadTasks: string[] = [];
  for (const memberId of assignedMemberIds) {
    const member = members.get(memberId)!;
    const assignedIds = actionable
      .filter((task) => assignments.get(task.id)?.candidateId === memberId)
      .map((task) => task.id);
    if (member.weeklyCapacityMinutes === null) unknownCapacityTasks.push(...assignedIds);
    if (member.knownWorkloadMinutes === null || member.unknownWorkloadTasks > 0)
      unknownWorkloadTasks.push(...assignedIds);
    const added = allocation.get(memberId)?.minutes ?? 0;
    if (
      member.weeklyCapacityMinutes !== null &&
      member.knownWorkloadMinutes !== null &&
      member.knownWorkloadMinutes + added > member.weeklyCapacityMinutes
    )
      overloadTasks.push(...assignedIds);
  }
  if (unknownCapacityTasks.length)
    risks.push(
      issue(
        'UNKNOWN_CAPACITY',
        'risk',
        unknownCapacityTasks,
        'Weekly availability is unknown for at least one intended owner.',
        'Confirm weekly availability before treating the execution window as credible.',
      ),
    );
  if (unknownWorkloadTasks.length)
    risks.push(
      issue(
        'UNKNOWN_WORKLOAD',
        'risk',
        unknownWorkloadTasks,
        'Existing member workload contains unknown estimates or an unknown subtotal.',
        'Review the member workload before committing additional work.',
      ),
    );
  if (overloadTasks.length)
    risks.push(
      issue(
        'CAPACITY_OVERLOAD',
        'risk',
        overloadTasks,
        'Known existing work plus this baseline exceeds documented weekly availability.',
        'Reassign work, reduce scope, or explicitly accept the capacity risk.',
      ),
    );
  if (plan.deadline === null)
    risks.push(
      issue(
        'SCHEDULE_UNCERTAIN',
        'risk',
        [],
        'The WBS has no committed project deadline, so the baseline uses dependency order and relative phases only.',
        'Confirm real project dates before promising a calendar completion date.',
      ),
    );

  const dependentCount = new Map<string, number>();
  for (const dependencyIds of dependencies.values())
    for (const dependencyId of dependencyIds)
      dependentCount.set(dependencyId, (dependentCount.get(dependencyId) ?? 0) + 1);

  const baselineTasks: ExecutionBaselineTask[] = actionable.map((task) => {
    const assignment = assignments.get(task.id);
    const candidate = assignment?.candidateId ? candidates.get(assignment.candidateId) : null;
    return {
      sourceTaskId: task.id,
      workPackageId: task.parentId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      estimateMinutes: task.estimateMinutes,
      deliverable: task.deliverable,
      acceptanceCriteria: task.acceptanceCriteria,
      requiredSkills: task.requiredSkills,
      sourceRefs: task.sourceRefs,
      assigneeUserId: candidate?.isRealMember && members.has(candidate.id) ? candidate.id : null,
      dependencyTaskIds: dependencies.get(task.id) ?? [],
      relativeWeek: scheduleByTask.get(task.id)?.relativeWeek ?? null,
    };
  });

  const source = {
    draftId: input.draft.id,
    wbsVersion: input.draft.version,
    proposalId: input.proposal.id,
    proposalVersion: input.proposal.version,
  };
  const workPackages = plan.tasks
    .filter((task) => aggregateIds.has(task.id))
    .map((task) => ({
      sourceTaskId: task.id,
      title: task.title,
      deliverable: task.deliverable,
      actionableTaskIds: actionable
        .filter((candidate) => candidate.parentId === task.id)
        .map((candidate) => candidate.id),
    }));
  const baseline: ExecutionBaseline = {
    project: input.project,
    source,
    title: plan.title,
    deadline: plan.deadline,
    assumptions: plan.assumptions,
    readinessRisks: risks,
    workPackages,
    tasks: baselineTasks,
    execution: {
      readyTaskIds: baselineTasks
        .filter((task) => task.dependencyTaskIds.length === 0)
        .map((task) => task.sourceTaskId),
      phases,
      parallelTaskGroups: phases
        .filter((phase) => phase.taskIds.length > 1)
        .map((phase) => phase.taskIds),
      bottleneckTaskIds: [...dependentCount.entries()]
        .filter(([, count]) => count > 1)
        .map(([taskId]) => taskId)
        .sort(),
    },
    checkpoints: workPackages
      .filter((workPackage) => workPackage.deliverable.trim())
      .slice(0, 4)
      .map((workPackage) => ({
        sourceWorkPackageId: workPackage.sourceTaskId,
        title: workPackage.title,
        deliverable: workPackage.deliverable,
        taskIds: workPackage.actionableTaskIds,
      })),
    mappingStrategy:
      'Each actionable WBS task becomes one Work Item. Aggregate work packages remain immutable grouping metadata, and actionable dependencies become blocking Work Item links.',
  };

  const knownAllocations = [...allocation.entries()].map(([memberId, value]) => ({
    memberId,
    memberName: members.get(memberId)?.name ?? memberId,
    minutes: value.minutes,
    unknownEstimateTaskCount: value.unknown,
    weeklyCapacityMinutes: members.get(memberId)?.weeklyCapacityMinutes ?? null,
    existingKnownWorkloadMinutes: members.get(memberId)?.knownWorkloadMinutes ?? null,
    unknownWorkloadTasks: members.get(memberId)?.unknownWorkloadTasks ?? 0,
  }));
  const status: ReadinessStatus = blockers.length
    ? 'blocked'
    : risks.length
      ? 'needs_review'
      : 'ready';
  const allIssues = [...blockers, ...risks];
  return {
    status,
    blockers,
    risks,
    recommendations: allIssues.map((readinessIssue) => ({
      issueCode: readinessIssue.code,
      action: readinessIssue.nextAction,
      affectedTaskIds: readinessIssue.affectedTaskIds,
    })),
    source,
    summary: {
      actionableTaskCount: actionable.length,
      aggregateWorkPackageCount: aggregateIds.size,
      assignedTaskCount: baselineTasks.filter((task) => task.assigneeUserId !== null).length,
      unassignedTaskCount: unassigned.length,
      knownEffortMinutes: actionable.reduce((sum, task) => sum + (task.estimateMinutes ?? 0), 0),
      unknownEstimateTaskCount: unknownEstimateIds.length,
      knownAllocations,
      credibleExecutionPlan: blockers.length === 0 && risks.length === 0,
    },
    baseline,
  };
}

export function assertLaunchCanPublish(preview: LaunchPreview, acknowledgedRiskCodes: string[]) {
  if (preview.blockers.length)
    throw new HttpError(409, 'Launch is blocked by unresolved integrity issues.', 'P4_BLOCKED');
  const acknowledged = new Set(acknowledgedRiskCodes);
  const missing = preview.risks.map((risk) => risk.code).filter((code) => !acknowledged.has(code));
  if (missing.length)
    throw new HttpError(
      409,
      `Acknowledge launch risks: ${missing.join(', ')}`,
      'P4_ACKNOWLEDGMENT_REQUIRED',
    );
}
