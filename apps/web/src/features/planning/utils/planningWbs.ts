import type { PlanSource, PlanTask } from '@/lib/api/endpoints/planning';

export function buildWbs(tasks: PlanTask[]) {
  const taskIds = new Set(tasks.map((task) => task.id));
  const roots = tasks.filter((task) => task.parentId === null || !taskIds.has(task.parentId));
  const children = new Map<string, PlanTask[]>();

  for (const task of tasks) {
    if (task.parentId === null || !taskIds.has(task.parentId)) continue;
    const siblings = children.get(task.parentId) ?? [];
    siblings.push(task);
    children.set(task.parentId, siblings);
  }

  return { roots, children };
}

export function summarizeWbs(tasks: PlanTask[]) {
  const { roots, children } = buildWbs(tasks);
  const estimatedTasks = roots.flatMap((root) => children.get(root.id) ?? [root]);
  const knownEffortMinutes = estimatedTasks.reduce(
    (total, task) => total + (task.estimateMinutes ?? 0),
    0,
  );
  const unknownEstimateCount = estimatedTasks.filter(
    (task) => task.estimateMinutes === null,
  ).length;
  const taskIds = new Set(tasks.map((task) => task.id));
  const unresolvedDependencyCount = tasks.reduce(
    (total, task) =>
      total + task.dependencyIds.filter((dependencyId) => !taskIds.has(dependencyId)).length,
    0,
  );

  return {
    rootCount: roots.length,
    childCount: tasks.length - roots.length,
    knownEffortMinutes,
    unknownEstimateCount,
    unresolvedDependencyCount,
    missingDeliverableCount: tasks.filter((task) => !task.deliverable.trim()).length,
  };
}

export function taskCode(tasks: PlanTask[], taskId: string): string {
  const index = tasks.findIndex((task) => task.id === taskId);
  return index === -1 ? '' : `T${index + 1}`;
}

export function sourceReference(
  reference: string,
  sources: PlanSource[],
): { kind: 'brief' } | { kind: 'block'; filename: string; excerpt: string } | null {
  if (reference === 'brief') return { kind: 'brief' };
  for (const source of sources) {
    const block = source.blocks.find((candidate) => candidate.ref === reference);
    if (block) return { kind: 'block', filename: source.filename, excerpt: block.text };
  }
  return null;
}
