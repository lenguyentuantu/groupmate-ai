import { z } from 'zod';
import { HttpError } from '#shared/lib';

const line = z.string().trim().min(1).max(1000);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const taskFields = {
  id,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000),
  deliverable: z.string().max(1000),
  acceptanceCriteria: z.array(line).max(20),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  requiredSkills: z.array(z.string().trim().min(1).max(60)).max(20),
  estimateMinutes: z.number().int().min(1).max(1000000).nullable(),
  dependencyIds: z.array(id).max(49),
  sourceRefs: z.array(z.string().min(1).max(160)).max(20),
};
const taskSchema = z.object({ ...taskFields, parentId: id.nullable() }).strict();
const generatedLeafTaskSchema = z.object(taskFields).strict();
const generatedRootTaskSchema = z
  .object({ ...taskFields, subtasks: z.array(generatedLeafTaskSchema).max(49) })
  .strict();
const planFields = {
  title: z.string().trim().min(1).max(200),
  brief: z.string().max(20000),
  objectives: z.array(line).max(30),
  deadline: z.string().date().nullable(),
  assumptions: z.array(line).max(30),
  questions: z.array(line).max(30),
};
export const planSchema = z
  .object({
    ...planFields,
    tasks: z.array(taskSchema).max(50),
  })
  .strict();
export type Plan = z.infer<typeof planSchema>;
export const sourceAssessmentSchema = z
  .object({
    attachmentId: z.string().min(1).max(160),
    classification: z.enum(['requirements', 'reference_only', 'irrelevant']),
    explanation: z.string().trim().min(1).max(500),
    relevantBlockRefs: z.array(z.string().min(1).max(160)).max(50),
  })
  .strict();
export const generatedPlanSchema = z
  .object({
    ...planFields,
    tasks: z.array(generatedRootTaskSchema).max(50),
    sourceAssessments: z.array(sourceAssessmentSchema).max(3),
  })
  .strict();
const generatedPlanInputSchema = generatedPlanSchema
  .extend({ sourceAssessments: z.array(sourceAssessmentSchema).max(3).optional() })
  .strict();
type GeneratedRootTask = z.infer<typeof generatedRootTaskSchema>;
export type SourceAssessment = z.infer<typeof sourceAssessmentSchema>;
export interface PlanSource {
  attachmentId: string;
  filename: string;
  blocks: { ref: string; text: string }[];
}

export function normalizeGeneratedSourceRefs(value: unknown, hasBrief: boolean): unknown {
  const result = generatedPlanInputSchema.safeParse(value);
  if (!result.success) return value;
  const normalize = (refs: string[]) =>
    refs.flatMap((ref) => {
      if (ref !== 'draft') return [ref];
      return hasBrief ? ['brief'] : [];
    });
  return {
    ...result.data,
    tasks: result.data.tasks.map((root) => ({
      ...root,
      estimateMinutes: root.subtasks.length ? null : root.estimateMinutes,
      sourceRefs: normalize(root.sourceRefs),
      subtasks: root.subtasks.map((child) => ({
        ...child,
        sourceRefs: normalize(child.sourceRefs),
      })),
    })),
  };
}

export function validateGeneratedPlan(value: unknown, original: unknown, sources: PlanSource[]) {
  const input = validatePlan(original, sources);
  const result = generatedPlanSchema.safeParse(
    normalizeGeneratedSourceRefs(value, Boolean(input.brief.trim())),
  );
  if (!result.success) throwPlanSchemaError(result.error);
  const { sourceAssessments, tasks, ...generated } = result.data;
  validateGeneratedHierarchy(tasks, decompositionRequested(input));
  const generatedContent = validatePlan(
    { ...generated, tasks: flattenGeneratedTasks(tasks) },
    sources,
  );
  const content = validatePlan(
    {
      ...generatedContent,
      title: input.title,
      brief: input.brief,
      objectives: input.objectives,
      deadline: input.deadline,
    },
    sources,
  );
  validateSourceAssessments(sourceAssessments, sources, content);
  return { content, sourceAssessments };
}

function decompositionRequested(input: Pick<Plan, 'brief' | 'objectives'>) {
  const englishRequest =
    /\b(?:sub(?:[ -])?tasks?|work packages?|decompos(?:e|ed|ition)|break(?:ing)? down|breakdown|two-level (?:WBS|hierarchy)|parent tasks? and child tasks?)\b/i;
  const englishNegation =
    /\b(?:no|without) (?:sub(?:[ -])?tasks?|work packages?|decomposition|breakdown)|\bdo not (?:(?:create|use) sub(?:[ -])?tasks?|decompose|break down)\b/i;
  const vietnameseRequest =
    /công việc con|nhiệm vụ con|phân rã|chia nhỏ|cong viec con|nhiem vu con|phan ra|chia nho/i;
  const vietnameseNegation =
    /(?:không|khong)\s+(?:(?:cần|can|tạo|tao|dùng|dung|yêu cầu|yeu cau)\s+)?(?:công việc con|nhiệm vụ con|phân rã|chia nhỏ|cong viec con|nhiem vu con|phan ra|chia nho)/i;
  return [input.brief, ...input.objectives].some(
    (text) =>
      !englishNegation.test(text) &&
      !vietnameseNegation.test(text) &&
      (englishRequest.test(text) || vietnameseRequest.test(text)),
  );
}

function validateGeneratedHierarchy(tasks: GeneratedRootTask[], requiresDecomposition: boolean) {
  let decomposed = 0;
  for (const root of tasks) {
    if (!root.subtasks.length) continue;
    decomposed++;
    if (root.subtasks.length < 2)
      throw new HttpError(400, 'A decomposed work package requires at least two subtasks');
    if (root.estimateMinutes !== null)
      throw new HttpError(400, 'Aggregate parent tasks cannot have an effort estimate');
    const childIds = new Set(root.subtasks.map((child) => child.id));
    if (
      root.dependencyIds.some((dependencyId) => childIds.has(dependencyId)) ||
      root.subtasks.some((child) => child.dependencyIds.includes(root.id))
    )
      throw new HttpError(400, 'Parent and child tasks cannot depend on each other');
  }
  if (requiresDecomposition && decomposed === 0)
    throw new HttpError(400, 'The brief requires at least one decomposed work package');
}

function flattenGeneratedTasks(tasks: GeneratedRootTask[]): Plan['tasks'] {
  return tasks.flatMap(({ subtasks, ...root }) => [
    { ...root, parentId: null },
    ...subtasks.map((child) => ({ ...child, parentId: root.id })),
  ]);
}

function validateSourceAssessments(
  assessments: SourceAssessment[],
  sources: PlanSource[],
  plan: Plan,
) {
  const byId = new Map(assessments.map((assessment) => [assessment.attachmentId, assessment]));
  if (assessments.length !== sources.length || byId.size !== assessments.length)
    throw new HttpError(400, 'Provide one relevance assessment for each source document');
  const assessedRefs = new Set<string>();
  for (const source of sources) {
    const assessment = byId.get(source.attachmentId);
    if (!assessment)
      throw new HttpError(400, 'Provide one relevance assessment for each source document');
    const sourceRefs = new Set(source.blocks.map((block) => block.ref));
    if (
      new Set(assessment.relevantBlockRefs).size !== assessment.relevantBlockRefs.length ||
      assessment.relevantBlockRefs.some((ref) => !sourceRefs.has(ref))
    )
      throw new HttpError(400, 'Unknown source reference in relevance assessment');
    if (assessment.classification === 'irrelevant') {
      if (assessment.relevantBlockRefs.length)
        throw new HttpError(400, 'Irrelevant sources cannot provide WBS evidence');
    } else if (!assessment.relevantBlockRefs.length) {
      throw new HttpError(400, 'Relevant sources require at least one supporting block');
    }
    for (const ref of assessment.relevantBlockRefs) assessedRefs.add(ref);
  }
  if (
    plan.tasks.some((task) =>
      task.sourceRefs.some((ref) => ref !== 'brief' && !assessedRefs.has(ref)),
    )
  )
    throw new HttpError(400, 'Task source reference is not supported by relevance assessment');
}

function throwPlanSchemaError(error: z.ZodError): never {
  throw new HttpError(
    400,
    error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
      .slice(0, 2000),
  );
}

export function validatePlan(value: unknown, sources: PlanSource[]): Plan {
  const result = planSchema.safeParse(value);
  if (!result.success) throwPlanSchemaError(result.error);
  const plan = result.data;
  const tasks = new Map(plan.tasks.map((task) => [task.id, task]));
  if (tasks.size !== plan.tasks.length) throw new HttpError(400, 'Task IDs must be unique');
  const refs = new Set([
    'brief',
    ...sources.flatMap((source) => source.blocks.map((block) => block.ref)),
  ]);
  for (const task of plan.tasks) {
    if (task.parentId !== null) {
      const parent = tasks.get(task.parentId);
      if (!parent || parent.id === task.id || parent.parentId !== null)
        throw new HttpError(400, 'Subtasks require a root parent and only one nesting level');
    }
    if (new Set(task.dependencyIds).size !== task.dependencyIds.length)
      throw new HttpError(400, 'Dependencies must be unique');
    if (task.dependencyIds.some((dep) => dep === task.id || !tasks.has(dep)))
      throw new HttpError(400, 'Invalid dependency reference');
    if (task.sourceRefs.some((ref) => !refs.has(ref) || (ref === 'brief' && !plan.brief.trim())))
      throw new HttpError(400, 'Unknown source reference');
  }
  const visited = new Set<string>(),
    visiting = new Set<string>();
  function visit(taskId: string) {
    if (visiting.has(taskId)) throw new HttpError(400, 'Dependency cycle detected');
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    const task = tasks.get(taskId)!;
    for (const dep of task.dependencyIds) visit(dep);
    // A parent completes after its subtasks; include this edge in cycle validation.
    for (const child of plan.tasks.filter((t) => t.parentId === taskId)) visit(child.id);
    visiting.delete(taskId);
    visited.add(taskId);
  }
  for (const task of plan.tasks) visit(task.id);
  return plan;
}
