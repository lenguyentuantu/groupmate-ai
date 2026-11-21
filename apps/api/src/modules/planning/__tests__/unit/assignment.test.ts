import { describe, expect, it } from 'bun:test';
import {
  applyAiAssignmentRecommendations,
  buildAssignmentAiReferences,
  buildAssignmentProposal,
  resolveAiAssignmentRecommendations,
  type PlanningCandidate,
  type PlanningTask,
} from '../../assignment';

const member = (id: string, skills: string[], capacity = 240): PlanningCandidate => ({
  id,
  name: id,
  isRealMember: true,
  skills,
  skillProficiencies: skills.map((name) => ({ name, proficiency: 3 })),
  weeklyCapacityMinutes: capacity,
  knownWorkloadMinutes: 0,
  unknownWorkloadTasks: 0,
});
const task = (id: string, skills: string[], estimateMinutes: number | null = 60): PlanningTask => ({
  id,
  title: id,
  description: id,
  parentId: null,
  estimateMinutes,
  requiredSkills: skills,
  dependencyIds: [],
});

describe('assignment proposal engine', () => {
  it('uses explicit skills and prioritizes known remaining capacity', () => {
    const result = buildAssignmentProposal(
      [task('backend', ['Backend']), task('frontend', ['Frontend'])],
      [
        { ...member('busy', ['backend', 'frontend']), knownWorkloadMinutes: 120 },
        member('free', ['backend', 'frontend']),
      ],
    );
    expect(result.assignments.map((item) => item.candidateId)).toEqual(['free', 'free']);
  });

  it('leaves work unassigned when skills or availability are unknown', () => {
    const result = buildAssignmentProposal(
      [task('unknown', ['testing'])],
      [
        { ...member('no-skills', []), weeklyCapacityMinutes: 240 },
        { ...member('no-capacity', ['testing']), weeklyCapacityMinutes: null },
      ],
    );
    expect(result.assignments[0].candidateId).toBeNull();
    expect(result.assignments[0].warning).toContain('nguồn lực');
  });

  it('excludes aggregate parents and keeps standalone roots assignable', () => {
    const result = buildAssignmentProposal(
      [
        { ...task('parent', [], null), parentId: null },
        { ...task('child', ['backend']), parentId: 'parent' },
        task('standalone', ['frontend']),
      ],
      [member('developer', ['backend', 'frontend'])],
    );
    expect(result.assignments.map((item) => item.taskId)).toEqual(['child', 'standalone']);
  });

  it('expands aggregate dependencies and preserves their ordering', () => {
    const result = buildAssignmentProposal(
      [
        { ...task('parent', [], null) },
        { ...task('child', ['backend']), parentId: 'parent' },
        { ...task('after', ['frontend']), dependencyIds: ['parent'] },
      ],
      [member('developer', ['backend', 'frontend'])],
    );
    expect(result.schedule.map((item) => item.taskId)).toEqual(['child', 'after']);
    expect(result.schedule[1].dependencyTaskIds).toEqual(['child']);
  });

  it('keeps a risky manual override visible instead of hiding the warning', () => {
    const result = buildAssignmentProposal(
      [task('task', ['backend'], 300)],
      [member('developer', ['frontend'], 120)],
      { task: 'developer' },
    );
    expect(result.assignments[0].candidateId).toBe('developer');
    expect(result.assignments[0].warning).toContain('Lựa chọn thủ công');
  });

  it('keeps an explicit manual unassignment without treating it as invalid input', () => {
    const result = buildAssignmentProposal(
      [task('task', ['backend'])],
      [member('developer', ['backend'])],
      {
        task: null,
      },
    );
    expect(result.assignments[0].candidateId).toBeNull();
    expect(result.assignments[0].warning).toBeNull();
  });

  it('recomputes risky overrides instead of trusting calculated assignment fields', () => {
    const result = buildAssignmentProposal(
      [task('task', ['backend'], 300)],
      [member('developer', ['frontend'], 120)],
      { task: 'developer' },
    );
    expect(result.assignments[0]).toMatchObject({
      candidateId: 'developer',
      matchingSkills: [],
      missingSkills: ['backend'],
      allocatedMinutes: 300,
    });
    expect(result.warnings).toContain(
      'Lựa chọn thủ công vượt qua kiểm tra mức độ phù hợp hoặc sức chứa đã biết.',
    );
  });

  it('matches equivalent Vietnamese skills and ranks higher proficiency first', () => {
    const result = buildAssignmentProposal(
      [task('requirements', ['Requirements Analysis'])],
      [
        {
          ...member('basic', ['Phân tích yêu cầu']),
          skillProficiencies: [{ name: 'Phân tích yêu cầu', proficiency: 2 }],
        },
        {
          ...member('advanced', ['Phân tích yêu cầu']),
          skillProficiencies: [{ name: 'Phân tích yêu cầu', proficiency: 5 }],
        },
      ],
    );
    expect(result.assignments[0]).toMatchObject({
      candidateId: 'advanced',
      matchingSkills: ['requirements analysis'],
      missingSkills: [],
    });
  });

  it('keeps corroborating related skills as a review recommendation', () => {
    const result = buildAssignmentProposal(
      [task('frontend', ['Frontend Development'])],
      [
        {
          ...member('developer', ['React', 'TypeScript', 'HTML/CSS']),
          skillProficiencies: [
            { name: 'React', proficiency: 4 },
            { name: 'TypeScript', proficiency: 4 },
            { name: 'HTML/CSS', proficiency: 3 },
          ],
        },
      ],
    );
    expect(result.assignments[0]).toMatchObject({
      candidateId: null,
      recommendedCandidateId: 'developer',
      status: 'PARTIAL_RECOMMENDATION',
    });
  });

  it('keeps a differently named related competency visible for review', () => {
    const result = buildAssignmentProposal(
      [task('quality', ['QA'])],
      [
        {
          ...member('tester', ['Testing/QA']),
          skillProficiencies: [{ name: 'Testing/QA', proficiency: 3 }],
        },
      ],
    );
    expect(result.assignments[0]).toMatchObject({
      candidateId: null,
      recommendedCandidateId: 'tester',
      status: 'PARTIAL_RECOMMENDATION',
      matchingSkills: ['quality assurance'],
    });
  });

  it('reports final proposal capacity consistently across task comparisons', () => {
    const result = buildAssignmentProposal(
      [task('first', ['Backend']), task('second', ['Backend'])],
      [member('developer', ['Backend'], 240)],
    );
    expect(result.assignments.map((assignment) => assignment.allocatedMinutes)).toEqual([120, 120]);
    expect(result.assignments.map((assignment) => assignment.remainingCapacityMinutes)).toEqual([
      120, 120,
    ]);
    expect(
      result.assignments.flatMap((assignment) =>
        assignment.alternatives.map((alternative) => alternative.remainingCapacityMinutes),
      ),
    ).toEqual([120, 120]);
  });

  it('does not auto-assign a beginner across a critical multidisciplinary gap', () => {
    const result = buildAssignmentProposal(
      [task('platform', ['Backend', 'Database', 'Authentication'])],
      [
        {
          ...member('frontend-specialist', ['Frontend', 'Backend']),
          skillProficiencies: [
            { name: 'Frontend', proficiency: 5 },
            { name: 'Backend', proficiency: 1 },
          ],
        },
      ],
    );
    expect(result.assignments[0]).toMatchObject({
      candidateId: null,
      matchingSkills: ['backend'],
      missingSkills: ['database', 'authentication'],
    });
  });

  it('applies a valid AI choice only through server-side candidate evidence', () => {
    const tasks = [task('backend', ['Backend'])];
    const candidates = [member('first', ['Backend']), member('second', ['Backend'])];
    const deterministic = buildAssignmentProposal(tasks, candidates);
    const result = applyAiAssignmentRecommendations(deterministic, tasks, candidates, [
      {
        taskId: 'backend',
        candidateId: 'second',
        action: 'assign',
        explanation: 'Đề xuất thành viên thứ hai để cân bằng danh mục công việc.',
        evidence: [],
        gaps: [],
        uncertainties: [],
        reviewRequired: false,
        alternatives: [],
      },
    ]);
    expect(result.assignments[0]).toMatchObject({
      candidateId: 'second',
      status: 'QUALIFIED_ASSIGNMENT',
      origin: 'ai_assisted',
    });
  });

  it('keeps an unfamiliar AI-inferred relationship as a review recommendation', () => {
    const tasks = [task('risk', ['Threat Modeling'])];
    const candidates = [member('security', ['Security Architecture'])];
    const deterministic = buildAssignmentProposal(tasks, candidates);
    const result = applyAiAssignmentRecommendations(deterministic, tasks, candidates, [
      {
        taskId: 'risk',
        candidateId: 'security',
        action: 'review',
        explanation:
          'Kinh nghiệm kiến trúc bảo mật có thể chuyển giao nhưng cần trưởng nhóm xác nhận.',
        evidence: [
          {
            requiredSkill: 'Threat Modeling',
            candidateSkills: ['Security Architecture'],
            relationship: 'transferable',
            uncertainty: 'Chưa có bằng chứng trực tiếp',
          },
        ],
        gaps: ['Chưa có kỹ năng Threat Modeling được xác minh'],
        uncertainties: ['Mức độ kinh nghiệm thực tế chưa được mô tả'],
        reviewRequired: true,
        alternatives: [],
      },
    ]);
    expect(result.assignments[0]).toMatchObject({
      candidateId: null,
      recommendedCandidateId: 'security',
      status: 'PARTIAL_RECOMMENDATION',
      origin: 'ai_assisted',
      reviewRequired: true,
    });
    expect(result.assignments[0].skillEvidence).toContainEqual(
      expect.objectContaining({ relationship: 'inferred' }),
    );
  });

  it('rejects an AI recommendation with a fabricated candidate ID', () => {
    const tasks = [task('backend', ['Backend'])];
    const candidates = [member('member', ['Backend'])];
    const deterministic = buildAssignmentProposal(tasks, candidates);
    expect(() =>
      applyAiAssignmentRecommendations(deterministic, tasks, candidates, [
        {
          taskId: 'backend',
          candidateId: 'fabricated',
          action: 'assign',
          explanation: 'Invalid recommendation',
          evidence: [],
          gaps: [],
          uncertainties: [],
          reviewRequired: false,
          alternatives: [],
        },
      ]),
    ).toThrow('invalid candidate');
  });

  it('resolves multiple documented skill references without accepting a composite skill', () => {
    const tasks = [task('frontend', ['Frontend Development'])];
    const candidates = [member('developer', ['React', 'TypeScript', 'HTML/CSS'])];
    const proposal = buildAssignmentProposal(tasks, candidates);
    const references = buildAssignmentAiReferences(proposal, tasks, candidates);
    const result = resolveAiAssignmentRecommendations(references.snapshot, [
      {
        taskRef: 't1',
        candidateRef: 'c1',
        action: 'review',
        explanation: 'Các kỹ năng giao diện có thể hỗ trợ yêu cầu này.',
        evidence: [
          {
            requiredSkillRef: 't1.r1',
            candidateSkillRefs: ['c1.s1', 'c1.s2', 'c1.s3', 'c1.s-composite'],
            relationship: 'transferable',
            uncertainty: 'Chưa xác minh toàn bộ năng lực phát triển giao diện.',
          },
        ],
        gaps: [],
        uncertainties: [],
        reviewRequired: true,
        alternatives: [],
      },
    ]);
    expect(result.recommendations[0].evidence[0].candidateSkills).toEqual([
      'react',
      'typescript',
      'html css',
    ]);
    expect(result.diagnostics).toHaveLength(1);
  });

  it('keeps valid task recommendations when another task contains invalid evidence', () => {
    const tasks = [task('frontend', ['Frontend Development']), task('backend', ['Backend'])];
    const candidates = [member('developer', ['React', 'Backend'])];
    const proposal = buildAssignmentProposal(tasks, candidates);
    const references = buildAssignmentAiReferences(proposal, tasks, candidates);
    const frontendInput = references.input.tasks.find((item) => item.title === 'frontend')!;
    const backendInput = references.input.tasks.find((item) => item.title === 'backend')!;
    const resolved = resolveAiAssignmentRecommendations(references.snapshot, [
      {
        taskRef: frontendInput.ref,
        candidateRef: 'c1',
        action: 'review',
        explanation: 'Cần xác nhận kinh nghiệm giao diện.',
        evidence: [
          {
            requiredSkillRef: frontendInput.requiredSkills[0].ref,
            candidateSkillRefs: ['c1.fabricated'],
            relationship: 'transferable',
            uncertainty: null,
          },
        ],
        gaps: [],
        uncertainties: [],
        reviewRequired: true,
        alternatives: [],
      },
      {
        taskRef: backendInput.ref,
        candidateRef: 'c1',
        action: 'assign',
        explanation: 'Kỹ năng Backend được ghi nhận trực tiếp.',
        evidence: [
          {
            requiredSkillRef: backendInput.requiredSkills[0].ref,
            candidateSkillRefs: ['c1.s2'],
            relationship: 'direct',
            uncertainty: null,
          },
        ],
        gaps: [],
        uncertainties: [],
        reviewRequired: false,
        alternatives: [],
      },
    ]);
    const applied = applyAiAssignmentRecommendations(
      proposal,
      tasks,
      candidates,
      resolved.recommendations,
    );
    expect(resolved.recommendations).toHaveLength(2);
    expect(resolved.diagnostics).toHaveLength(1);
    expect(applied.assignments.find((item) => item.taskId === 'backend')).toMatchObject({
      candidateId: 'developer',
      status: 'QUALIFIED_ASSIGNMENT',
    });
  });

  it('does not recommend a candidate when no valid skill evidence remains', () => {
    const tasks = [task('specialist', ['Quantum Computing'])];
    const candidates = [member('developer', ['Backend'])];
    const proposal = buildAssignmentProposal(tasks, candidates);
    const references = buildAssignmentAiReferences(proposal, tasks, candidates);
    const resolved = resolveAiAssignmentRecommendations(references.snapshot, [
      {
        taskRef: 't1',
        candidateRef: 'c1',
        action: 'assign',
        explanation: 'Unsupported assignment',
        evidence: [
          {
            requiredSkillRef: 't1.r1',
            candidateSkillRefs: ['c1.fabricated'],
            relationship: 'transferable',
            uncertainty: null,
          },
        ],
        gaps: [],
        uncertainties: [],
        reviewRequired: false,
        alternatives: [],
      },
    ]);
    const result = applyAiAssignmentRecommendations(
      proposal,
      tasks,
      candidates,
      resolved.recommendations,
    );
    expect(result.assignments[0]).toMatchObject({
      candidateId: null,
      recommendedCandidateId: null,
      reviewRequired: true,
    });
  });

  it('enforces cumulative capacity after resolving AI references', () => {
    const tasks = [task('first', ['Backend']), task('second', ['Backend'])];
    const candidates = [member('developer', ['Backend'], 60)];
    const proposal = buildAssignmentProposal(tasks, candidates);
    const references = buildAssignmentAiReferences(proposal, tasks, candidates);
    const recommendations = ['t1', 't2'].map((taskRef) => ({
      taskRef,
      candidateRef: 'c1',
      action: 'assign' as const,
      explanation: 'Đề xuất cùng thành viên.',
      evidence: [
        {
          requiredSkillRef: `${taskRef}.r1`,
          candidateSkillRefs: ['c1.s1'],
          relationship: 'direct' as const,
          uncertainty: null,
        },
      ],
      gaps: [],
      uncertainties: [],
      reviewRequired: false,
      alternatives: [],
    }));
    const resolved = resolveAiAssignmentRecommendations(references.snapshot, recommendations);
    const result = applyAiAssignmentRecommendations(
      proposal,
      tasks,
      candidates,
      resolved.recommendations,
    );
    expect(result.assignments.filter((item) => item.candidateId === 'developer')).toHaveLength(1);
    expect(result.assignments.find((item) => item.taskId === 'second')).toMatchObject({
      candidateId: null,
      status: 'CAPACITY_CONFLICT',
      reviewRequired: true,
    });
  });
});
