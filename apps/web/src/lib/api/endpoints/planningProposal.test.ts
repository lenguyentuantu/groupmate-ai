import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizePlanningProposalResponse,
  summarizePlanningWarnings,
  type PlanningProposal,
} from './planning';

const proposal: PlanningProposal = {
  sourceVersion: 4,
  candidates: [
    {
      id: 'member-1',
      name: 'Member 1',
      isRealMember: true,
      skills: ['backend'],
      weeklyCapacityMinutes: 240,
      knownWorkloadMinutes: 60,
      unknownWorkloadTasks: 0,
    },
  ],
  assignments: [
    {
      taskId: 'task-1',
      candidateId: 'member-1',
      matchingSkills: ['backend'],
      missingSkills: [],
      reason: 'Matches backend.',
      warning: null,
      allocatedMinutes: 120,
      remainingCapacityMinutes: 60,
    },
  ],
  schedule: [
    {
      taskId: 'task-1',
      order: 1,
      relativeWeek: 1,
      dependencyTaskIds: [],
      canRunInParallel: true,
    },
  ],
  warnings: ['Review capacity'],
};

describe('planning proposal response normalization', () => {
  it('keeps generated proposals in the render shape', () => {
    assert.deepEqual(normalizePlanningProposalResponse(proposal), proposal);
  });

  it('unwraps save responses while preserving metadata and manual overrides', () => {
    const saved = normalizePlanningProposalResponse({
      id: 8,
      draftId: 3,
      version: 2,
      sourceVersion: 4,
      stale: false,
      content: {
        ...proposal,
        assignments: [{ ...proposal.assignments[0], candidateId: null }],
      },
      updatedAt: '2026-11-11T00:00:00.000Z',
    });
    assert.equal(saved.id, 8);
    assert.equal(saved.draftId, 3);
    assert.equal(saved.version, 2);
    assert.equal(saved.assignments[0].candidateId, null);
    assert.deepEqual(saved.warnings, proposal.warnings);
  });

  it('normalizes reopened saved proposals to the same render shape', () => {
    const reopened = normalizePlanningProposalResponse({
      id: 8,
      draftId: 3,
      version: 2,
      sourceVersion: 4,
      stale: false,
      content: proposal,
      updatedAt: '2026-11-11T00:00:00.000Z',
    });
    assert.deepEqual(reopened.assignments, proposal.assignments);
    assert.deepEqual(reopened.candidates, proposal.candidates);
    assert.equal(reopened.sourceVersion, proposal.sourceVersion);
  });

  it('allows an empty warnings array', () => {
    const result = normalizePlanningProposalResponse({ ...proposal, warnings: [] });
    assert.deepEqual(result.warnings, []);
  });

  it('rejects malformed required proposal arrays', () => {
    assert.throws(
      () => normalizePlanningProposalResponse({ ...proposal, assignments: undefined }),
      /assignments must be an array/,
    );
    assert.throws(
      () =>
        normalizePlanningProposalResponse({
          id: 8,
          draftId: 3,
          version: 2,
          sourceVersion: 4,
          stale: false,
          content: { ...proposal, candidates: 'invalid' },
          updatedAt: '2026-11-11T00:00:00.000Z',
        }),
      /candidates must be an array/,
    );
  });

  it('uses an empty warnings list only when the optional field is absent', () => {
    const result = normalizePlanningProposalResponse({
      ...proposal,
      warnings: undefined,
    });
    assert.deepEqual(result.warnings, []);
  });

  it('summarizes identical warnings without hiding different task details', () => {
    assert.deepEqual(
      summarizePlanningWarnings([
        'task-1: no capacity',
        'task-1: no capacity',
        'task-2: no capacity',
      ]),
      [
        { message: 'task-1: no capacity', count: 2 },
        { message: 'task-2: no capacity', count: 1 },
      ],
    );
  });

  it('keeps warning normalization idempotent across repeated rechecks and reopen', () => {
    const first = normalizePlanningProposalResponse({
      ...proposal,
      warnings: ['task-1: no capacity', 'task-1: no capacity'],
    });
    const second = normalizePlanningProposalResponse({
      id: 8,
      draftId: 3,
      version: 2,
      sourceVersion: 4,
      stale: false,
      content: first,
      updatedAt: '2026-11-11T00:00:00.000Z',
    });
    assert.deepEqual(summarizePlanningWarnings(second.warnings), [
      { message: 'task-1: no capacity', count: 2 },
    ]);
    assert.deepEqual(second.assignments, proposal.assignments);
  });
});
