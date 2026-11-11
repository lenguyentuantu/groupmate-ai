import type { Plan } from './validation';

export interface PlanningCandidate {
  id: string;
  name: string;
  isRealMember: boolean;
  skills: string[];
  weeklyCapacityMinutes: number | null;
  knownWorkloadMinutes: number | null;
  unknownWorkloadTasks: number;
}

export interface PlanningTask {
  id: string;
  title: string;
  parentId: string | null;
  estimateMinutes: number | null;
  requiredSkills: string[];
  dependencyIds: string[];
}

export interface ProposalAssignment {
  taskId: string;
  candidateId: string | null;
  matchingSkills: string[];
  missingSkills: string[];
  reason: string;
  warning: string | null;
  allocatedMinutes: number;
  remainingCapacityMinutes: number | null;
}

export interface ProposalScheduleEntry {
  taskId: string;
  order: number;
  relativeWeek: number | null;
  dependencyTaskIds: string[];
  canRunInParallel: boolean;
}

export interface AssignmentProposal {
  assignments: ProposalAssignment[];
  schedule: ProposalScheduleEntry[];
  warnings: string[];
}

export type AssignmentOverrides = Record<string, string | null>;

const skillAliases = new Map([
  ['frontend development', 'frontend'],
  ['front-end development', 'frontend'],
  ['front end', 'frontend'],
  ['backend development', 'backend'],
  ['back-end development', 'backend'],
  ['back end', 'backend'],
  ['database design', 'database'],
  ['qa testing', 'testing'],
  ['qa/test', 'testing'],
  ['documentation writing', 'documentation'],
]);

export function normalizeSkill(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return skillAliases.get(normalized) ?? normalized;
}

function actionableTasks(tasks: PlanningTask[]) {
  const parentIds = new Set(
    tasks
      .filter((task) => tasks.some((child) => child.parentId === task.id))
      .map((task) => task.id),
  );
  return tasks.filter((task) => task.parentId !== null || !parentIds.has(task.id));
}

function dependencyMap(tasks: PlanningTask[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const children = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.parentId)
      children.set(task.parentId, [...(children.get(task.parentId) ?? []), task.id]);
  }
  return new Map(
    tasks.map((task) => {
      const dependencies = task.dependencyIds.flatMap((id) => {
        const dependency = byId.get(id);
        return dependency && children.has(dependency.id)
          ? (children.get(dependency.id) ?? [])
          : [id];
      });
      return [task.id, dependencies.filter((id) => byId.has(id) && id !== task.id)];
    }),
  );
}

function topologicalOrder(tasks: PlanningTask[], dependencies: Map<string, string[]>) {
  const remaining = new Set(tasks.map((task) => task.id));
  const order: string[] = [];
  while (remaining.size) {
    const ready = [...remaining]
      .filter((id) =>
        (dependencies.get(id) ?? []).every((dependency) => !remaining.has(dependency)),
      )
      .sort();
    if (!ready.length) throw new Error('Planning task dependencies contain a cycle');
    order.push(...ready);
    ready.forEach((id) => remaining.delete(id));
  }
  return order;
}

function taskFromPlan(task: PlanningTask | Plan['tasks'][number]): PlanningTask {
  return {
    id: task.id,
    title: task.title,
    parentId: task.parentId,
    estimateMinutes: task.estimateMinutes,
    requiredSkills: task.requiredSkills,
    dependencyIds: task.dependencyIds,
  };
}

export function buildAssignmentProposal(
  inputTasks: PlanningTask[] | Plan['tasks'],
  candidates: PlanningCandidate[],
  overrides: AssignmentOverrides = {},
): AssignmentProposal {
  const tasks = inputTasks.map((task) => taskFromPlan(task));
  const actionable = actionableTasks(tasks);
  const byTask = new Map(actionable.map((task) => [task.id, task]));
  const dependencies = dependencyMap(tasks);
  const order = topologicalOrder(actionable, dependencies);
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const allocations = new Map<string, number>();
  const assignments: ProposalAssignment[] = [];
  const warnings = new Set<string>();

  for (const taskId of order) {
    const task = byTask.get(taskId)!;
    const required = [...new Set(task.requiredSkills.map(normalizeSkill).filter(Boolean))];
    const estimate = task.estimateMinutes;
    if (estimate !== null && estimate < 15) {
      warnings.add(`Task ${task.id} has a suspiciously small effort estimate.`);
    }

    const override = Object.prototype.hasOwnProperty.call(overrides, task.id)
      ? overrides[task.id]
      : undefined;
    if (override === null) {
      assignments.push({
        taskId: task.id,
        candidateId: null,
        matchingSkills: [],
        missingSkills: required,
        reason: 'Left unassigned by the project leader for review.',
        warning: null,
        allocatedMinutes: 0,
        remainingCapacityMinutes: null,
      });
      continue;
    }
    const eligible = candidates
      .map((candidate) => {
        const skills = new Set(candidate.skills.map(normalizeSkill));
        const matchingSkills = required.filter((skill) => skills.has(skill));
        const missingSkills = required.filter((skill) => !skills.has(skill));
        const allocated = allocations.get(candidate.id) ?? 0;
        const remaining =
          candidate.weeklyCapacityMinutes === null
            ? null
            : candidate.weeklyCapacityMinutes - (candidate.knownWorkloadMinutes ?? 0) - allocated;
        return { candidate, matchingSkills, missingSkills, allocated, remaining };
      })
      .filter(({ candidate, missingSkills, remaining }) => {
        if (override !== undefined) return candidate.id === override;
        return (
          missingSkills.length === 0 &&
          candidate.skills.length > 0 &&
          candidate.weeklyCapacityMinutes !== null &&
          (estimate === null || (remaining ?? 0) >= estimate)
        );
      })
      .sort(
        (a, b) =>
          b.matchingSkills.length - a.matchingSkills.length ||
          a.allocated - b.allocated ||
          a.candidate.id.localeCompare(b.candidate.id),
      );

    const selected = eligible[0];
    if (!selected) {
      const reason =
        override !== undefined
          ? 'The selected candidate is not in the project planning roster.'
          : candidates.length === 0
            ? 'No planning candidates were provided.'
            : 'No candidate has documented skills and known remaining capacity for this task.';
      warnings.add(`${task.id}: ${reason}`);
      assignments.push({
        taskId: task.id,
        candidateId: null,
        matchingSkills: [],
        missingSkills: required,
        reason,
        warning: reason,
        allocatedMinutes: 0,
        remainingCapacityMinutes: null,
      });
      continue;
    }

    const { candidate, matchingSkills, missingSkills, remaining } = selected;
    const allocated = (allocations.get(candidate.id) ?? 0) + (estimate ?? 0);
    allocations.set(candidate.id, allocated);
    let warning: string | null = null;
    if (candidate.knownWorkloadMinutes === null || candidate.unknownWorkloadTasks > 0) {
      warning = 'Existing workload is incomplete, so remaining capacity is uncertain.';
      warnings.add(`${task.id}: ${warning}`);
    }
    if (
      override !== undefined &&
      (missingSkills.length || (estimate !== null && (remaining ?? 0) < estimate))
    ) {
      warning = 'Manual override exceeds the known suitability or capacity checks.';
      warnings.add(`${task.id}: ${warning}`);
    }
    assignments.push({
      taskId: task.id,
      candidateId: candidate.id,
      matchingSkills,
      missingSkills,
      reason: `Matches ${matchingSkills.join(', ')} and has the lowest known allocated workload.`,
      warning,
      allocatedMinutes: allocated,
      remainingCapacityMinutes:
        candidate.weeklyCapacityMinutes === null
          ? null
          : candidate.weeklyCapacityMinutes - (candidate.knownWorkloadMinutes ?? 0) - allocated,
    });
  }

  const assignmentByTask = new Map(
    assignments.map((assignment) => [assignment.taskId, assignment]),
  );
  const weekByTask = new Map<string, number>();
  const schedule = order.map((taskId, index) => {
    const dependenciesForTask = dependencies.get(taskId) ?? [];
    const dependencyWeek = Math.max(0, ...dependenciesForTask.map((id) => weekByTask.get(id) ?? 0));
    const assignment = assignmentByTask.get(taskId)!;
    const candidate = assignment.candidateId ? candidateById.get(assignment.candidateId) : null;
    const relativeWeek =
      candidate?.weeklyCapacityMinutes && assignment.candidateId
        ? Math.max(1, dependencyWeek + 1)
        : null;
    if (relativeWeek !== null) weekByTask.set(taskId, relativeWeek);
    return {
      taskId,
      order: index + 1,
      relativeWeek,
      dependencyTaskIds: dependenciesForTask,
      canRunInParallel: dependenciesForTask.length === 0,
    };
  });

  return { assignments, schedule, warnings: [...warnings] };
}
