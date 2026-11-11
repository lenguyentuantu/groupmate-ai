import { describe, expect, it } from 'bun:test';
import {
  buildAssignmentProposal,
  type PlanningCandidate,
  type PlanningTask,
} from '../../assignment';

const member = (id: string, skills: string[], capacity = 240): PlanningCandidate => ({
  id,
  name: id,
  isRealMember: true,
  skills,
  weeklyCapacityMinutes: capacity,
  knownWorkloadMinutes: 0,
  unknownWorkloadTasks: 0,
});
const task = (id: string, skills: string[], estimateMinutes: number | null = 60): PlanningTask => ({
  id,
  title: id,
  parentId: null,
  estimateMinutes,
  requiredSkills: skills,
  dependencyIds: [],
});

describe('assignment proposal engine', () => {
  it('uses explicit skills and balances qualified candidates by workload', () => {
    const result = buildAssignmentProposal(
      [task('backend', ['Backend']), task('frontend', ['Frontend'])],
      [
        { ...member('busy', ['backend', 'frontend']), knownWorkloadMinutes: 120 },
        member('free', ['backend', 'frontend']),
      ],
    );
    expect(result.assignments.map((item) => item.candidateId)).toEqual(['busy', 'free']);
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
    expect(result.warnings[0]).toContain('No candidate');
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
    expect(result.assignments[0].warning).toContain('Manual override');
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
      'task: Manual override exceeds the known suitability or capacity checks.',
    );
  });
});
