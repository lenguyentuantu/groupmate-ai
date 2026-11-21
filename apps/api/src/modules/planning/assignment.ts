import type { Plan } from './validation';

export interface PlanningCandidate {
  id: string;
  name: string;
  isRealMember: boolean;
  skills: string[];
  skillProficiencies?: { name: string; proficiency: number }[];
  weeklyCapacityMinutes: number | null;
  knownWorkloadMinutes: number | null;
  unknownWorkloadTasks: number;
}

export interface PlanningTask {
  id: string;
  title: string;
  description: string;
  parentId: string | null;
  estimateMinutes: number | null;
  requiredSkills: string[];
  dependencyIds: string[];
}

export type AssignmentDecisionStatus =
  | 'QUALIFIED_ASSIGNMENT'
  | 'PARTIAL_RECOMMENDATION'
  | 'NO_SAFE_CANDIDATE'
  | 'INSUFFICIENT_DATA'
  | 'CAPACITY_CONFLICT'
  | 'MANUAL_DECISION';

export type AssignmentOrigin = 'deterministic' | 'ai_assisted' | 'manual';

export interface AssignmentSkillEvidence {
  requiredSkill: string;
  candidateSkills: string[];
  relationship: 'direct' | 'equivalent' | 'related' | 'inferred' | 'missing';
  proficiency: number | null;
}

export interface AssignmentAlternative {
  candidateId: string;
  matchQuality: number;
  matchingSkills: string[];
  missingSkills: string[];
  remainingCapacityMinutes: number | null;
  qualified: boolean;
  capacityStatus: 'sufficient' | 'insufficient' | 'unknown';
  source: 'deterministic' | 'ai_assisted';
  reason: string | null;
}

export interface ProposalAssignment {
  taskId: string;
  candidateId: string | null;
  recommendedCandidateId: string | null;
  status: AssignmentDecisionStatus;
  origin: AssignmentOrigin;
  matchQuality: number;
  skillEvidence: AssignmentSkillEvidence[];
  alternatives: AssignmentAlternative[];
  suggestedAction: string | null;
  concerns: string[];
  reviewRequired: boolean;
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
  planningInsights: {
    allocationStrategy: string;
    bottlenecks: string[];
    risks: string[];
    tradeoffs: string[];
  } | null;
}

export type AssignmentOverrides = Record<string, string | null>;

export interface AiAssignmentRecommendation {
  taskId: string;
  candidateId: string | null;
  action: 'assign' | 'review' | 'split' | 'pair' | 'recruit' | 'reschedule' | 'unassigned';
  explanation: string;
  evidence: {
    requiredSkill: string;
    candidateSkills: string[];
    relationship: 'direct' | 'equivalent' | 'transferable';
    uncertainty: string | null;
  }[];
  gaps: string[];
  uncertainties: string[];
  reviewRequired: boolean;
  alternatives: { candidateId: string; reason: string }[];
}

export interface AiAssignmentReferenceRecommendation {
  taskRef: string;
  candidateRef: string | null;
  action: AiAssignmentRecommendation['action'];
  explanation: string;
  evidence: {
    requiredSkillRef: string;
    candidateSkillRefs: string[];
    relationship: 'direct' | 'equivalent' | 'transferable' | 'insufficient';
    uncertainty: string | null;
  }[];
  gaps: string[];
  uncertainties: string[];
  reviewRequired: boolean;
  alternatives: { candidateRef: string; reason: string }[];
}

export interface AssignmentAiReferenceSnapshot {
  tasks: Map<
    string,
    {
      taskId: string;
      requiredSkills: Map<string, { name: string; normalized: string }>;
    }
  >;
  candidates: Map<
    string,
    {
      candidateId: string;
      skills: Map<string, { name: string; normalized: string; proficiency: number | null }>;
    }
  >;
}

const skillAliases = new Map([
  ['ba', 'business analysis'],
  ['business analyst', 'business analysis'],
  ['phan tich yeu cau', 'requirements analysis'],
  ['quan ly du an', 'project management'],
  ['qa', 'quality assurance'],
  ['frontend development', 'frontend'],
  ['front-end development', 'frontend'],
  ['front end', 'frontend'],
  ['backend development', 'backend'],
  ['back-end development', 'backend'],
  ['back end', 'backend'],
  ['database design', 'database'],
  ['front end development', 'frontend'],
  ['back end development', 'backend'],
  ['ui ux design', 'ui ux'],
  ['user interface user experience', 'ui ux'],
  ['qa test', 'testing'],
  ['qa testing', 'testing'],
  ['testing qa', 'testing'],
  ['software testing', 'testing'],
  ['documentation writing', 'documentation'],
]);

export function normalizeSkill(value: string) {
  const normalized = normalizeSkillText(value);
  return skillAliases.get(normalized) ?? normalized;
}

function normalizeSkillText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const relatedSkills = new Map<string, Set<string>>([
  ['frontend', new Set(['react', 'typescript', 'javascript', 'html css', 'vue', 'angular'])],
  ['ui ux', new Set(['figma', 'prototyping'])],
  ['prototyping', new Set(['figma', 'ui ux'])],
  ['testing', new Set(['quality assurance'])],
  ['database', new Set(['postgresql', 'sql', 'mysql'])],
  ['api', new Set(['backend', 'rest api'])],
  ['documentation', new Set(['business analysis', 'requirements analysis', 'project management'])],
]);

interface SkillEvidence extends AssignmentSkillEvidence {
  kind: 'strong' | 'partial' | 'missing';
}

function candidateSkills(candidate: PlanningCandidate) {
  const levels = new Map<string, number>();
  for (const skill of candidate.skillProficiencies ?? []) {
    const name = normalizeSkill(skill.name);
    const proficiency = Math.max(1, Math.min(5, skill.proficiency));
    levels.set(name, Math.max(levels.get(name) ?? 0, proficiency));
  }
  return [
    ...new Map(
      candidate.skills
        .map((sourceName) => ({
          name: normalizeSkill(sourceName),
          literal: normalizeSkillText(sourceName),
        }))
        .filter((skill) => skill.name)
        .map((skill) => [skill.name, skill]),
    ).values(),
  ].map((skill) => ({ ...skill, proficiency: levels.get(skill.name) ?? null }));
}

function skillsAreRelated(requiredSkill: string, candidateSkill: string) {
  return (
    relatedSkills.get(requiredSkill)?.has(candidateSkill) === true ||
    relatedSkills.get(candidateSkill)?.has(requiredSkill) === true
  );
}

function evaluateSkill(requiredSkill: string, candidate: PlanningCandidate): SkillEvidence {
  const skills = candidateSkills(candidate);
  const exact = skills.find((skill) => skill.name === requiredSkill);
  if (exact) {
    return {
      requiredSkill,
      kind: exact.proficiency === null || exact.proficiency === 1 ? 'partial' : 'strong',
      candidateSkills: [exact.name],
      relationship: exact.literal === requiredSkill ? 'direct' : 'equivalent',
      proficiency: exact.proficiency,
    };
  }
  const related = skills.filter((skill) => skillsAreRelated(requiredSkill, skill.name));
  if (!related.length)
    return {
      requiredSkill,
      kind: 'missing',
      candidateSkills: [],
      relationship: 'missing',
      proficiency: null,
    };
  return {
    requiredSkill,
    kind: 'partial',
    candidateSkills: related.map((skill) => skill.name),
    relationship: 'related',
    proficiency: related.some((skill) => skill.proficiency !== null)
      ? Math.max(...related.map((skill) => skill.proficiency ?? 0))
      : null,
  };
}

function skillMatchQuality(evidence: SkillEvidence[]) {
  if (!evidence.length) return 0;
  return Math.round(
    (evidence.reduce((total, item) => {
      if (item.kind === 'strong') return total + Math.min(100, 60 + (item.proficiency ?? 2) * 8);
      if (item.kind === 'partial') return total + Math.min(60, 25 + (item.proficiency ?? 0) * 7);
      return total;
    }, 0) /
      (evidence.length * 100)) *
      100,
  );
}

function remainingCapacity(candidate: PlanningCandidate, allocatedMinutes: number) {
  if (candidate.weeklyCapacityMinutes === null || candidate.knownWorkloadMinutes === null)
    return null;
  return candidate.weeklyCapacityMinutes - candidate.knownWorkloadMinutes - allocatedMinutes;
}

function capacityStatus(
  candidate: PlanningCandidate,
  estimateMinutes: number | null,
  allocatedMinutes: number,
): AssignmentAlternative['capacityStatus'] {
  const remaining = remainingCapacity(candidate, allocatedMinutes);
  if (estimateMinutes === null || remaining === null) return 'unknown';
  return remaining >= estimateMinutes ? 'sufficient' : 'insufficient';
}

function finalCapacityStatus(
  candidate: PlanningCandidate,
  estimateMinutes: number | null,
  allocatedMinutes: number,
  includesTask: boolean,
): AssignmentAlternative['capacityStatus'] {
  const remaining = remainingCapacity(candidate, allocatedMinutes);
  if (remaining === null) return 'unknown';
  if (includesTask) return remaining >= 0 ? 'sufficient' : 'insufficient';
  if (estimateMinutes === null) return 'unknown';
  return remaining >= estimateMinutes ? 'sufficient' : 'insufficient';
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
    description: task.description,
    parentId: task.parentId,
    estimateMinutes: task.estimateMinutes,
    requiredSkills: task.requiredSkills,
    dependencyIds: task.dependencyIds,
  };
}

export function buildAssignmentAlternative(
  task: PlanningTask,
  candidate: PlanningCandidate,
  allocatedMinutes: number,
  source: AssignmentAlternative['source'],
  reason: string | null,
): AssignmentAlternative {
  const required = [...new Set(task.requiredSkills.map(normalizeSkill).filter(Boolean))];
  const evidence = required.map((skill) => evaluateSkill(skill, candidate));
  return {
    candidateId: candidate.id,
    matchQuality: skillMatchQuality(evidence),
    matchingSkills: evidence
      .filter((item) => item.kind !== 'missing')
      .map((item) => item.requiredSkill),
    missingSkills: evidence
      .filter((item) => item.kind === 'missing')
      .map((item) => item.requiredSkill),
    remainingCapacityMinutes: remainingCapacity(candidate, allocatedMinutes),
    qualified: required.length > 0 && evidence.every((item) => item.kind === 'strong'),
    capacityStatus: capacityStatus(candidate, task.estimateMinutes, allocatedMinutes),
    source,
    reason,
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
  const qualificationCount = new Map(
    actionable.map((task) => {
      const required = [...new Set(task.requiredSkills.map(normalizeSkill).filter(Boolean))];
      const count = candidates.filter((candidate) => {
        const evidence = required.map((skill) => evaluateSkill(skill, candidate));
        const remaining =
          candidate.weeklyCapacityMinutes === null
            ? null
            : candidate.weeklyCapacityMinutes - (candidate.knownWorkloadMinutes ?? 0);
        return (
          required.length > 0 &&
          evidence.every((item) => item.kind === 'strong') &&
          task.estimateMinutes !== null &&
          remaining !== null &&
          candidate.knownWorkloadMinutes !== null &&
          candidate.unknownWorkloadTasks === 0 &&
          remaining >= task.estimateMinutes
        );
      }).length;
      return [task.id, count];
    }),
  );
  const allocationOrder = [...order].sort((leftId, rightId) => {
    const leftOverride = typeof overrides[leftId] === 'string' ? 0 : 1;
    const rightOverride = typeof overrides[rightId] === 'string' ? 0 : 1;
    if (leftOverride !== rightOverride) return leftOverride - rightOverride;
    const scarcity = (qualificationCount.get(leftId) ?? 0) - (qualificationCount.get(rightId) ?? 0);
    if (scarcity) return scarcity;
    const left = byTask.get(leftId)!;
    const right = byTask.get(rightId)!;
    return (
      right.requiredSkills.length - left.requiredSkills.length ||
      (right.estimateMinutes ?? 0) - (left.estimateMinutes ?? 0) ||
      order.indexOf(leftId) - order.indexOf(rightId)
    );
  });

  for (const taskId of allocationOrder) {
    const task = byTask.get(taskId)!;
    const required = [...new Set(task.requiredSkills.map(normalizeSkill).filter(Boolean))];
    const estimate = task.estimateMinutes;
    if (estimate !== null && estimate < 15) {
      warnings.add('Có công việc có ước tính thời gian thấp bất thường.');
    }

    const override = Object.prototype.hasOwnProperty.call(overrides, task.id)
      ? overrides[task.id]
      : undefined;
    if (override === null) {
      assignments.push({
        taskId: task.id,
        candidateId: null,
        recommendedCandidateId: null,
        status: 'MANUAL_DECISION',
        origin: 'manual',
        matchQuality: 0,
        skillEvidence: [],
        alternatives: [],
        suggestedAction: null,
        concerns: [],
        reviewRequired: false,
        matchingSkills: [],
        missingSkills: required,
        reason: 'Trưởng nhóm chủ động để công việc ở trạng thái chưa phân công.',
        warning: null,
        allocatedMinutes: 0,
        remainingCapacityMinutes: null,
      });
      continue;
    }
    const ranked = candidates
      .map((candidate) => {
        const evidence = required.map((skill) => evaluateSkill(skill, candidate));
        const matchingSkills = evidence
          .filter((item) => item.kind !== 'missing')
          .map((item) => item.requiredSkill);
        const missingSkills = evidence
          .filter((item) => item.kind === 'missing')
          .map((item) => item.requiredSkill);
        const strongMatches = evidence.filter((item) => item.kind === 'strong').length;
        const partialMatches = evidence.filter((item) => item.kind === 'partial').length;
        const proficiencyScore = evidence.reduce(
          (sum, item) => sum + (item.proficiency ?? (item.kind === 'strong' ? 3 : 0)),
          0,
        );
        const allocated = allocations.get(candidate.id) ?? 0;
        const remaining =
          candidate.weeklyCapacityMinutes === null
            ? null
            : candidate.weeklyCapacityMinutes - (candidate.knownWorkloadMinutes ?? 0) - allocated;
        const fullyQualified = missingSkills.length === 0 && partialMatches === 0;
        const matchQuality = skillMatchQuality(evidence);
        return {
          candidate,
          evidence,
          matchingSkills,
          missingSkills,
          strongMatches,
          partialMatches,
          proficiencyScore,
          allocated,
          remaining,
          fullyQualified,
          plausiblePartial: matchingSkills.length > 0,
          matchQuality,
          score: strongMatches * 100 + partialMatches * 35 + proficiencyScore,
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          (b.remaining ?? -1) - (a.remaining ?? -1) ||
          a.allocated - b.allocated ||
          a.candidate.id.localeCompare(b.candidate.id),
      );
    const alternatives = ranked.slice(0, 5).map((item) => ({
      candidateId: item.candidate.id,
      matchQuality: item.matchQuality,
      matchingSkills: item.matchingSkills,
      missingSkills: item.missingSkills,
      remainingCapacityMinutes: item.remaining,
      qualified: item.fullyQualified,
      capacityStatus: capacityStatus(item.candidate, estimate, item.allocated),
      source: 'deterministic' as const,
      reason: null,
    }));
    const eligible = ranked.filter(({ candidate, fullyQualified, remaining }) => {
      if (override !== undefined) return candidate.id === override;
      return (
        fullyQualified &&
        required.length > 0 &&
        candidate.skills.length > 0 &&
        candidate.weeklyCapacityMinutes !== null &&
        candidate.knownWorkloadMinutes !== null &&
        candidate.unknownWorkloadTasks === 0 &&
        estimate !== null &&
        (remaining ?? 0) >= estimate
      );
    });

    const selected = eligible[0];
    if (!selected) {
      const closest = ranked[0];
      let status: AssignmentDecisionStatus = 'NO_SAFE_CANDIDATE';
      if (override !== undefined) status = 'MANUAL_DECISION';
      else if (
        !closest ||
        required.length === 0 ||
        closest.candidate.weeklyCapacityMinutes === null ||
        estimate === null ||
        closest.candidate.unknownWorkloadTasks > 0
      )
        status = 'INSUFFICIENT_DATA';
      else if (closest.fullyQualified && (closest.remaining ?? 0) < estimate)
        status = 'CAPACITY_CONFLICT';
      else if (closest.plausiblePartial) status = 'PARTIAL_RECOMMENDATION';

      const partialEvidence = closest?.evidence
        .filter((item) => item.kind === 'partial')
        .map((item) => {
          const level = item.proficiency === null ? 'chưa rõ trình độ' : `${item.proficiency}/5`;
          return `${item.requiredSkill} từ ${item.candidateSkills.join(', ')} (${level})`;
        });
      let reason: string;
      let warning: string;
      let suggestedAction: string | null = null;
      if (override !== undefined) {
        reason = 'Thành viên được chọn không có trong danh sách lập kế hoạch của dự án.';
        warning = 'Hãy chọn lại một thành viên hiện còn trong dự án.';
      } else if (!closest) {
        reason = 'Dự án chưa có thành viên để đánh giá phân công.';
        warning = 'Hãy thêm thành viên dự án trước khi phân công.';
      } else if (required.length === 0) {
        reason = 'Công việc chưa mô tả kỹ năng cần thiết nên chưa thể đánh giá mức độ phù hợp.';
        warning = 'Hãy bổ sung kỹ năng yêu cầu hoặc phân công thủ công.';
      } else if (estimate === null) {
        reason = `${closest.candidate.name} có hồ sơ gần nhất nhưng công việc chưa có ước tính thời gian.`;
        warning = 'Hãy bổ sung ước tính để kiểm tra sức chứa trước khi phân công.';
      } else if (
        closest.candidate.weeklyCapacityMinutes === null ||
        closest.candidate.knownWorkloadMinutes === null ||
        closest.candidate.unknownWorkloadTasks > 0
      ) {
        reason = `${closest.candidate.name} có hồ sơ gần nhất nhưng thiếu dữ liệu thời gian khả dụng hoặc khối lượng hiện tại.`;
        warning = 'Hãy cập nhật hồ sơ nguồn lực trước khi xác nhận phân công.';
      } else if (closest.fullyQualified && (closest.remaining ?? 0) < estimate) {
        reason = `${closest.candidate.name} có kỹ năng phù hợp nhưng chỉ còn ${Math.max(0, closest.remaining ?? 0)} phút cho công việc cần ${estimate} phút.`;
        warning = 'Hãy điều chỉnh lịch, giảm phạm vi hoặc chọn nguồn lực khác.';
        suggestedAction = 'reschedule';
      } else if (closest.matchingSkills.length) {
        const evidence = partialEvidence?.join('; ');
        const gap = closest.missingSkills.length
          ? ` Còn thiếu bằng chứng cho ${closest.missingSkills.join(', ')}.`
          : '';
        reason = `${closest.candidate.name} có bằng chứng liên quan${evidence ? `: ${evidence}` : ''}.${gap}`;
        warning = 'Bằng chứng liên quan chưa đủ để xem là năng lực đã được xác minh.';
        suggestedAction = 'review';
      } else {
        reason = `Chưa có hồ sơ thành viên cung cấp bằng chứng cho ${required.join(', ')}.`;
        warning = 'Hãy bổ sung chuyên môn, cập nhật hồ sơ hoặc phân công thủ công có kiểm soát.';
        suggestedAction = 'recruit';
      }
      warnings.add(warning);
      assignments.push({
        taskId: task.id,
        candidateId: null,
        recommendedCandidateId:
          closest?.matchingSkills.length &&
          closest.candidate.weeklyCapacityMinutes !== null &&
          closest.candidate.knownWorkloadMinutes !== null &&
          (estimate === null || (closest.remaining ?? 0) >= estimate)
            ? closest.candidate.id
            : null,
        status,
        origin: override !== undefined ? 'manual' : 'deterministic',
        matchQuality: closest?.matchQuality ?? 0,
        skillEvidence: closest?.evidence ?? [],
        alternatives,
        suggestedAction,
        concerns: [...(closest?.missingSkills ?? required), ...(partialEvidence ?? [])],
        reviewRequired: true,
        matchingSkills: closest?.matchingSkills ?? [],
        missingSkills: closest?.missingSkills ?? required,
        reason,
        warning,
        allocatedMinutes: 0,
        remainingCapacityMinutes: null,
      });
      continue;
    }

    const { candidate, evidence, matchingSkills, missingSkills, remaining } = selected;
    const allocated = (allocations.get(candidate.id) ?? 0) + (estimate ?? 0);
    allocations.set(candidate.id, allocated);
    const warningParts: string[] = [];
    if (estimate === null) {
      warningParts.push('Công việc chưa có ước tính thời gian nên chưa thể xác nhận sức chứa.');
    }
    if (candidate.knownWorkloadMinutes === null || candidate.unknownWorkloadTasks > 0) {
      warningParts.push(
        'Dữ liệu khối lượng công việc hiện tại chưa đầy đủ nên sức chứa còn lại chưa chắc chắn.',
      );
    }
    if (
      override !== undefined &&
      (missingSkills.length || (estimate !== null && (remaining ?? 0) < estimate))
    ) {
      warningParts.push(
        'Lựa chọn thủ công vượt qua kiểm tra mức độ phù hợp hoặc sức chứa đã biết.',
      );
    } else if (evidence.some((item) => item.kind === 'partial')) {
      warningParts.push(
        'Đề xuất dựa một phần trên kỹ năng liên quan; trưởng nhóm cần xác nhận trước khi giao.',
      );
    }
    const warning = warningParts.length ? warningParts.join(' ') : null;
    if (warning) warnings.add(warning);
    const evidenceReason = evidence.length
      ? evidence
          .map((item) => {
            const level = item.proficiency === null ? 'chưa rõ trình độ' : `${item.proficiency}/5`;
            return `${item.requiredSkill}: ${item.candidateSkills.join(', ')} (${level})`;
          })
          .join('; ')
      : 'chưa có yêu cầu kỹ năng để đối chiếu';
    assignments.push({
      taskId: task.id,
      candidateId: candidate.id,
      recommendedCandidateId: null,
      status: override !== undefined ? 'MANUAL_DECISION' : 'QUALIFIED_ASSIGNMENT',
      origin: override !== undefined ? 'manual' : 'deterministic',
      matchQuality: selected.matchQuality,
      skillEvidence: evidence,
      alternatives,
      suggestedAction: null,
      concerns: warningParts,
      reviewRequired: warningParts.length > 0,
      matchingSkills,
      missingSkills,
      reason: `Đề xuất ${candidate.name}: ${evidenceReason}; còn đủ thời gian theo dữ liệu hiện có.`,
      warning,
      allocatedMinutes: allocated,
      remainingCapacityMinutes:
        candidate.weeklyCapacityMinutes === null
          ? null
          : candidate.weeklyCapacityMinutes - (candidate.knownWorkloadMinutes ?? 0) - allocated,
    });
  }

  assignments.sort((left, right) => order.indexOf(left.taskId) - order.indexOf(right.taskId));

  const finalAllocations = new Map<string, number>();
  for (const assignment of assignments) {
    if (!assignment.candidateId) continue;
    const estimate = byTask.get(assignment.taskId)?.estimateMinutes;
    if (estimate === null || estimate === undefined) continue;
    finalAllocations.set(
      assignment.candidateId,
      (finalAllocations.get(assignment.candidateId) ?? 0) + estimate,
    );
  }
  for (const assignment of assignments) {
    const task = byTask.get(assignment.taskId)!;
    if (assignment.candidateId) {
      const candidate = candidateById.get(assignment.candidateId)!;
      assignment.allocatedMinutes = finalAllocations.get(candidate.id) ?? 0;
      assignment.remainingCapacityMinutes = remainingCapacity(
        candidate,
        assignment.allocatedMinutes,
      );
    }
    assignment.alternatives = assignment.alternatives.map((alternative) => {
      const candidate = candidateById.get(alternative.candidateId)!;
      const allocatedMinutes = finalAllocations.get(candidate.id) ?? 0;
      return {
        ...alternative,
        remainingCapacityMinutes: remainingCapacity(candidate, allocatedMinutes),
        capacityStatus: finalCapacityStatus(
          candidate,
          task.estimateMinutes,
          allocatedMinutes,
          assignment.candidateId === candidate.id,
        ),
      };
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

  return { assignments, schedule, warnings: [...warnings], planningInsights: null };
}

export function buildAssignmentAiReferences(
  proposal: AssignmentProposal,
  tasks: PlanningTask[],
  candidates: PlanningCandidate[],
) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const scheduleByTask = new Map(proposal.schedule.map((entry) => [entry.taskId, entry]));
  const taskRefById = new Map<string, string>();
  const candidateRefById = new Map<string, string>();
  const taskReferences: AssignmentAiReferenceSnapshot['tasks'] = new Map();
  const candidateReferences: AssignmentAiReferenceSnapshot['candidates'] = new Map();

  const taskInput = proposal.assignments.map((assignment, taskIndex) => {
    const task = taskById.get(assignment.taskId)!;
    const taskRef = `t${taskIndex + 1}`;
    taskRefById.set(task.id, taskRef);
    const requiredSkills = new Map<string, { name: string; normalized: string }>();
    const requiredSkillInput = [
      ...new Set(task.requiredSkills.map(normalizeSkill).filter(Boolean)),
    ].map((name, skillIndex) => {
      const ref = `${taskRef}.r${skillIndex + 1}`;
      requiredSkills.set(ref, { name, normalized: name });
      return { ref, name };
    });
    taskReferences.set(taskRef, { taskId: task.id, requiredSkills });
    return {
      ref: taskRef,
      title: task.title,
      description: task.description,
      requiredSkills: requiredSkillInput,
      estimateMinutes: task.estimateMinutes,
      dependencyRefs: [] as string[],
    };
  });

  for (const [candidateIndex, candidate] of candidates.entries()) {
    const candidateRef = `c${candidateIndex + 1}`;
    candidateRefById.set(candidate.id, candidateRef);
    const documentedSkills = candidateSkills(candidate);
    const skills = new Map<
      string,
      { name: string; normalized: string; proficiency: number | null }
    >();
    documentedSkills.forEach((skill, skillIndex) => {
      const ref = `${candidateRef}.s${skillIndex + 1}`;
      skills.set(ref, { name: skill.name, normalized: skill.name, proficiency: skill.proficiency });
    });
    candidateReferences.set(candidateRef, { candidateId: candidate.id, skills });
  }

  const candidateInput = candidates.map((candidate) => {
    const ref = candidateRefById.get(candidate.id)!;
    const reference = candidateReferences.get(ref)!;
    return {
      ref,
      name: candidate.name,
      isRealMember: candidate.isRealMember,
      skills: [...reference.skills].map(([skillRef, skill]) => ({
        ref: skillRef,
        name: skill.name,
        proficiency: skill.proficiency,
      })),
      weeklyCapacityMinutes: candidate.weeklyCapacityMinutes,
      knownWorkloadMinutes: candidate.knownWorkloadMinutes,
      unknownWorkloadTasks: candidate.unknownWorkloadTasks,
    };
  });

  for (const task of taskInput) {
    const taskId = taskReferences.get(task.ref)!.taskId;
    task.dependencyRefs = (scheduleByTask.get(taskId)?.dependencyTaskIds ?? [])
      .map((dependencyId) => taskRefById.get(dependencyId))
      .filter((ref): ref is string => ref !== undefined);
  }

  return {
    snapshot: { tasks: taskReferences, candidates: candidateReferences },
    input: {
      tasks: taskInput,
      candidates: candidateInput,
      baseline: proposal.assignments.map((assignment) => ({
        taskRef: taskRefById.get(assignment.taskId)!,
        candidateRef: assignment.candidateId
          ? (candidateRefById.get(assignment.candidateId) ?? null)
          : null,
        status: assignment.status,
        origin: assignment.origin,
        reviewRequired: assignment.reviewRequired,
      })),
    },
  };
}

export function resolveAiAssignmentRecommendations(
  snapshot: AssignmentAiReferenceSnapshot,
  recommendations: AiAssignmentReferenceRecommendation[],
) {
  const diagnostics: string[] = [];
  const grouped = new Map<string, AiAssignmentReferenceRecommendation[]>();
  for (const recommendation of recommendations) {
    grouped.set(recommendation.taskRef, [
      ...(grouped.get(recommendation.taskRef) ?? []),
      recommendation,
    ]);
  }
  const resolved: AiAssignmentRecommendation[] = [];

  for (const [taskRef, taskRecommendations] of grouped) {
    const taskReference = snapshot.tasks.get(taskRef);
    if (!taskReference) {
      diagnostics.push('AI returned a recommendation for an unknown task reference.');
      continue;
    }
    if (taskRecommendations.length !== 1) {
      diagnostics.push(`AI returned conflicting recommendations for ${taskRef}.`);
      continue;
    }
    const recommendation = taskRecommendations[0];
    const candidateReference = recommendation.candidateRef
      ? snapshot.candidates.get(recommendation.candidateRef)
      : null;
    if (recommendation.candidateRef && !candidateReference) {
      diagnostics.push(`AI returned an unavailable candidate for ${taskRef}.`);
      continue;
    }
    if (!candidateReference && recommendation.action === 'assign') {
      diagnostics.push(`AI attempted to assign ${taskRef} without a candidate.`);
      continue;
    }

    const evidence: AiAssignmentRecommendation['evidence'] = [];
    for (const item of recommendation.evidence) {
      const requiredSkill = taskReference.requiredSkills.get(item.requiredSkillRef);
      if (!requiredSkill) {
        diagnostics.push(`AI returned unsupported requirement evidence for ${taskRef}.`);
        continue;
      }
      if (item.relationship === 'insufficient') continue;
      if (!candidateReference) {
        diagnostics.push(`AI returned candidate evidence without a candidate for ${taskRef}.`);
        continue;
      }
      const resolvedSkills = item.candidateSkillRefs
        .map((ref) => candidateReference.skills.get(ref))
        .filter((skill): skill is NonNullable<typeof skill> => skill !== undefined);
      if (resolvedSkills.length !== item.candidateSkillRefs.length)
        diagnostics.push(`AI returned unsupported candidate evidence for ${taskRef}.`);
      if (!resolvedSkills.length) continue;

      let relationship: AiAssignmentRecommendation['evidence'][number]['relationship'] =
        item.relationship;
      const exactRelationship = resolvedSkills.some(
        (skill) => skill.normalized === requiredSkill.normalized,
      );
      if (relationship !== 'transferable' && !exactRelationship) {
        relationship = 'transferable';
        diagnostics.push(`AI evidence was downgraded to transferable for ${taskRef}.`);
      }
      evidence.push({
        requiredSkill: requiredSkill.name,
        candidateSkills: resolvedSkills.map((skill) => skill.name),
        relationship,
        uncertainty: item.uncertainty,
      });
    }

    const seenAlternatives = new Set<string>();
    const alternatives = recommendation.alternatives.flatMap((alternative) => {
      const reference = snapshot.candidates.get(alternative.candidateRef);
      if (!reference || seenAlternatives.has(reference.candidateId)) {
        diagnostics.push(`AI returned an invalid alternative for ${taskRef}.`);
        return [];
      }
      seenAlternatives.add(reference.candidateId);
      return [{ candidateId: reference.candidateId, reason: alternative.reason }];
    });
    resolved.push({
      taskId: taskReference.taskId,
      candidateId: candidateReference?.candidateId ?? null,
      action: recommendation.action,
      explanation: recommendation.explanation,
      evidence,
      gaps: recommendation.gaps,
      uncertainties: recommendation.uncertainties,
      reviewRequired: recommendation.reviewRequired,
      alternatives,
    });
  }

  return { recommendations: resolved, diagnostics };
}

export function applyAiAssignmentRecommendations(
  proposal: AssignmentProposal,
  tasks: PlanningTask[],
  candidates: PlanningCandidate[],
  recommendations: AiAssignmentRecommendation[],
  planningInsights: AssignmentProposal['planningInsights'] = null,
): AssignmentProposal {
  const assignmentByTask = new Map(proposal.assignments.map((item) => [item.taskId, item]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const seen = new Set<string>();
  const proposed = new Map<string, ProposalAssignment>();

  for (const recommendation of recommendations) {
    const assignment = assignmentByTask.get(recommendation.taskId);
    const task = taskById.get(recommendation.taskId);
    if (!assignment || !task || seen.has(recommendation.taskId))
      throw new Error('AI assignment recommendation references an invalid or duplicate task');
    seen.add(recommendation.taskId);
    if (assignment.origin === 'manual') continue;
    if (
      new Set(recommendation.alternatives.map((alternative) => alternative.candidateId)).size !==
      recommendation.alternatives.length
    )
      throw new Error('AI assignment recommendation contains duplicate alternatives');
    const required = new Set(task.requiredSkills.map(normalizeSkill).filter(Boolean));
    if (recommendation.candidateId === null) {
      if (recommendation.action === 'assign')
        throw new Error('AI assignment recommendation cannot assign without a candidate');
      const aiAlternatives = recommendation.alternatives.map((alternative) => {
        const alternativeCandidate = candidateById.get(alternative.candidateId);
        if (!alternativeCandidate)
          throw new Error('AI assignment recommendation references an invalid alternative');
        return buildAssignmentAlternative(
          task,
          alternativeCandidate,
          0,
          'ai_assisted',
          alternative.reason,
        );
      });
      const alternatives = [
        ...aiAlternatives,
        ...assignment.alternatives.filter(
          (alternative) =>
            !aiAlternatives.some(
              (aiAlternative) => aiAlternative.candidateId === alternative.candidateId,
            ),
        ),
      ].slice(0, 5);
      const concerns = [...new Set([...recommendation.gaps, ...recommendation.uncertainties])];
      if (assignment.candidateId) {
        proposed.set(recommendation.taskId, {
          ...assignment,
          alternatives,
          suggestedAction: recommendation.action,
          concerns,
          reviewRequired: true,
          warning:
            'AI đề xuất không phân công hoặc điều chỉnh chiến lược; phân công xác định hiện tại được giữ nguyên.',
        });
        continue;
      }
      proposed.set(recommendation.taskId, {
        ...assignment,
        reason: recommendation.explanation,
        suggestedAction: recommendation.action,
        origin: 'ai_assisted',
        concerns,
        reviewRequired: true,
        alternatives,
      });
      continue;
    }

    const candidate = candidateById.get(recommendation.candidateId);
    if (!candidate) throw new Error('AI assignment recommendation references an invalid candidate');
    const candidateSkillNames = new Set(candidate.skills.map(normalizeSkill).filter(Boolean));
    for (const evidence of recommendation.evidence) {
      if (
        !required.has(normalizeSkill(evidence.requiredSkill)) ||
        evidence.candidateSkills.length === 0 ||
        evidence.candidateSkills.some(
          (candidateSkill) => !candidateSkillNames.has(normalizeSkill(candidateSkill)),
        )
      )
        throw new Error('AI assignment recommendation contains unsupported skill evidence');
    }
    const documentedSkills = candidateSkills(candidate);
    const evaluated = [...required].map((skill) => evaluateSkill(skill, candidate));
    const inferredByRequirement = new Map<string, AssignmentSkillEvidence>();
    for (const evidence of recommendation.evidence) {
      if (evidence.relationship !== 'transferable') continue;
      const requiredSkill = normalizeSkill(evidence.requiredSkill);
      const supportingSkills = evidence.candidateSkills.map(normalizeSkill);
      const proficiencies = supportingSkills
        .map((name) => documentedSkills.find((skill) => skill.name === name)?.proficiency ?? null)
        .filter((level): level is number => level !== null);
      const existing = inferredByRequirement.get(requiredSkill);
      inferredByRequirement.set(requiredSkill, {
        requiredSkill,
        candidateSkills: [...new Set([...(existing?.candidateSkills ?? []), ...supportingSkills])],
        relationship: 'inferred',
        proficiency: proficiencies.length
          ? Math.max(existing?.proficiency ?? 0, ...proficiencies)
          : (existing?.proficiency ?? null),
      });
    }
    const concerns = [
      ...new Set([
        ...recommendation.gaps,
        ...recommendation.uncertainties,
        ...recommendation.evidence.flatMap((evidence) =>
          evidence.uncertainty ? [evidence.uncertainty] : [],
        ),
      ]),
    ];
    const hasDefensibleEvidence =
      evaluated.some((item) => item.kind !== 'missing') || inferredByRequirement.size > 0;
    if (!hasDefensibleEvidence) {
      proposed.set(recommendation.taskId, {
        ...assignment,
        suggestedAction: recommendation.action === 'assign' ? 'review' : recommendation.action,
        concerns,
        reviewRequired: true,
        warning:
          'Đề xuất AI không có bằng chứng kỹ năng hợp lệ; kết quả xác định hiện tại được giữ nguyên.',
      });
      continue;
    }
    const fullyQualified = required.size > 0 && evaluated.every((item) => item.kind === 'strong');
    const hasKnownCapacity =
      task.estimateMinutes !== null &&
      candidate.weeklyCapacityMinutes !== null &&
      candidate.knownWorkloadMinutes !== null;
    const workloadIsComplete = candidate.unknownWorkloadTasks === 0;
    const canConfirm =
      candidate.isRealMember &&
      fullyQualified &&
      hasKnownCapacity &&
      workloadIsComplete &&
      recommendation.action === 'assign' &&
      !recommendation.reviewRequired;
    const aiAlternatives = recommendation.alternatives.map((alternative) => {
      const alternativeCandidate = candidateById.get(alternative.candidateId);
      if (!alternativeCandidate)
        throw new Error('AI assignment recommendation references an invalid alternative');
      return buildAssignmentAlternative(
        task,
        alternativeCandidate,
        0,
        'ai_assisted',
        alternative.reason,
      );
    });
    if (
      !canConfirm &&
      !aiAlternatives.some((alternative) => alternative.candidateId === candidate.id)
    ) {
      aiAlternatives.unshift(
        buildAssignmentAlternative(task, candidate, 0, 'ai_assisted', recommendation.explanation),
      );
    }
    const alternatives = [
      ...aiAlternatives,
      ...assignment.alternatives.filter(
        (alternative) =>
          !aiAlternatives.some(
            (aiAlternative) => aiAlternative.candidateId === alternative.candidateId,
          ),
      ),
    ].slice(0, 5);
    if (!canConfirm && assignment.candidateId) {
      proposed.set(recommendation.taskId, {
        ...assignment,
        recommendedCandidateId: candidate.id,
        alternatives,
        suggestedAction: recommendation.action === 'assign' ? 'review' : recommendation.action,
        concerns,
        reviewRequired: true,
        warning:
          'AI đề xuất một phương án khác cần trưởng nhóm xem xét; phân công xác định hiện tại được giữ nguyên.',
      });
      continue;
    }
    proposed.set(recommendation.taskId, {
      ...assignment,
      candidateId: canConfirm ? candidate.id : assignment.candidateId,
      recommendedCandidateId: canConfirm ? null : candidate.id,
      status: canConfirm ? 'QUALIFIED_ASSIGNMENT' : 'PARTIAL_RECOMMENDATION',
      origin: 'ai_assisted',
      matchQuality: skillMatchQuality(evaluated),
      skillEvidence: [
        ...evaluated.filter(
          (item) =>
            item.kind !== 'missing' ||
            !inferredByRequirement.has(normalizeSkill(item.requiredSkill)),
        ),
        ...inferredByRequirement.values(),
      ],
      alternatives,
      matchingSkills: evaluated
        .filter((item) => item.kind !== 'missing')
        .map((item) => item.requiredSkill),
      missingSkills: evaluated
        .filter((item) => item.kind === 'missing')
        .map((item) => item.requiredSkill),
      reason: recommendation.explanation,
      warning: canConfirm
        ? assignment.warning
        : 'Đây là suy luận của AI từ kỹ năng đã khai báo, không phải năng lực đã được xác minh.',
      suggestedAction: recommendation.action === 'assign' ? null : recommendation.action,
      concerns,
      reviewRequired: !canConfirm || recommendation.reviewRequired,
    });
  }

  const nextAssignments = proposal.assignments.map(
    (assignment) => proposed.get(assignment.taskId) ?? assignment,
  );
  const totalByCandidate = new Map<string, number>();
  for (const assignment of nextAssignments) {
    if (!assignment.candidateId) continue;
    const estimate = taskById.get(assignment.taskId)?.estimateMinutes;
    if (estimate === null || estimate === undefined) continue;
    totalByCandidate.set(
      assignment.candidateId,
      (totalByCandidate.get(assignment.candidateId) ?? 0) + estimate,
    );
  }
  const warnings = new Set(proposal.warnings);
  const validatedAssignments = nextAssignments.map((assignment) => {
    if (assignment.origin !== 'ai_assisted' || !assignment.candidateId) return assignment;
    const candidate = candidateById.get(assignment.candidateId)!;
    const capacity = candidate.weeklyCapacityMinutes;
    const workload = candidate.knownWorkloadMinutes;
    const total = totalByCandidate.get(candidate.id) ?? 0;
    if (capacity !== null && workload !== null && workload + total <= capacity) return assignment;
    const original = assignmentByTask.get(assignment.taskId)!;
    const warning = 'Đề xuất AI không được áp dụng vì vượt quá sức chứa đã biết.';
    warnings.add(warning);
    return {
      ...original,
      recommendedCandidateId: assignment.candidateId,
      status: original.candidateId ? original.status : 'CAPACITY_CONFLICT',
      alternatives: assignment.alternatives,
      suggestedAction: assignment.suggestedAction,
      concerns: [...new Set([...assignment.concerns, warning])],
      reviewRequired: true,
      warning,
    };
  });

  const finalTotals = new Map<string, number>();
  for (const assignment of validatedAssignments) {
    if (!assignment.candidateId) continue;
    const estimate = taskById.get(assignment.taskId)?.estimateMinutes;
    if (estimate === null || estimate === undefined) continue;
    finalTotals.set(
      assignment.candidateId,
      (finalTotals.get(assignment.candidateId) ?? 0) + estimate,
    );
  }
  const reconciledAssignments = validatedAssignments.map((assignment) => {
    const task = taskById.get(assignment.taskId)!;
    const candidate = assignment.candidateId
      ? candidateById.get(assignment.candidateId)
      : undefined;
    const allocatedMinutes = candidate ? (finalTotals.get(candidate.id) ?? 0) : 0;
    return {
      ...assignment,
      ...(candidate
        ? {
            allocatedMinutes,
            remainingCapacityMinutes: remainingCapacity(candidate, allocatedMinutes),
          }
        : {}),
      alternatives: assignment.alternatives.map((alternative) => {
        const alternativeCandidate = candidateById.get(alternative.candidateId)!;
        const alternativeAllocation = finalTotals.get(alternativeCandidate.id) ?? 0;
        return {
          ...alternative,
          remainingCapacityMinutes: remainingCapacity(alternativeCandidate, alternativeAllocation),
          capacityStatus: finalCapacityStatus(
            alternativeCandidate,
            task.estimateMinutes,
            alternativeAllocation,
            assignment.candidateId === alternativeCandidate.id,
          ),
        };
      }),
    };
  });

  return {
    ...proposal,
    assignments: reconciledAssignments,
    warnings: [...warnings],
    planningInsights,
  };
}
