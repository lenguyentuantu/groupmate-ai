import { describe, expect, it } from 'bun:test';
import {
  canActOnDeliverable,
  canDecideDeliverable,
  canReviewDeliverable,
  canSubmitDeliverable,
  deliverableContentType,
  deliverableStatus,
  STALE_REVIEW_MS,
  type SubmissionPolicyState,
} from '../../policy';

const submission = (patch: Partial<SubmissionPolicyState> = {}): SubmissionPolicyState => ({
  decision: null,
  reviewStatus: 'not_requested',
  reviewAttemptCount: 0,
  reviewStartedAt: null,
  ...patch,
});

describe('deliverable workflow policy', () => {
  it('permits only the assignee or Project Owner to act', () => {
    expect(canActOnDeliverable('member', 'member-a', 'member-a')).toBeTrue();
    expect(canActOnDeliverable('owner', 'member-a', 'owner-a')).toBeTrue();
    expect(canActOnDeliverable('member', 'member-a', 'member-b')).toBeFalse();
  });

  it('reserves the final decision for the Project Owner after AI review', () => {
    const reviewed = submission({ reviewStatus: 'completed' });
    expect(canDecideDeliverable('owner', reviewed)).toBeTrue();
    expect(canDecideDeliverable('member', reviewed)).toBeFalse();
    expect(canDecideDeliverable('owner', submission())).toBeFalse();
    expect(
      canDecideDeliverable('owner', submission({ ...reviewed, decision: 'ACCEPT' })),
    ).toBeFalse();
  });

  it('allows resubmission only after revision is requested', () => {
    expect(canSubmitDeliverable(undefined)).toBeTrue();
    expect(canSubmitDeliverable(submission())).toBeFalse();
    expect(canSubmitDeliverable(submission({ decision: 'ACCEPT' }))).toBeFalse();
    expect(canSubmitDeliverable(submission({ decision: 'REQUEST_REVISION' }))).toBeTrue();
  });

  it('prevents duplicate or excessive review attempts and permits an explicit stale retry', () => {
    const now = Date.now();
    expect(
      canReviewDeliverable(
        submission({ reviewStatus: 'pending', reviewStartedAt: new Date(now) }),
        now,
      ),
    ).toBeFalse();
    expect(
      canReviewDeliverable(
        submission({
          reviewStatus: 'pending',
          reviewStartedAt: new Date(now - STALE_REVIEW_MS),
        }),
        now,
      ),
    ).toBeTrue();
    expect(canReviewDeliverable(submission({ reviewAttemptCount: 3 }), now)).toBeFalse();
    expect(canReviewDeliverable(submission({ reviewStatus: 'completed' }), now)).toBeFalse();
  });

  it('derives refresh-safe workflow status from persisted submission state', () => {
    expect(deliverableStatus(undefined)).toBe('NOT_SUBMITTED');
    expect(deliverableStatus(submission())).toBe('SUBMITTED');
    expect(deliverableStatus(submission({ reviewStatus: 'completed' }))).toBe('AI_REVIEWED');
    expect(deliverableStatus(submission({ decision: 'ACCEPT' }))).toBe('ACCEPTED');
    expect(deliverableStatus(submission({ decision: 'REQUEST_REVISION' }))).toBe(
      'REVISION_REQUESTED',
    );
  });

  it('accepts only PDF and DOCX filenames before content extraction validates bytes', () => {
    expect(deliverableContentType('report.PDF')).toBe('application/pdf');
    expect(deliverableContentType('report.docx')).toContain('wordprocessingml');
    expect(deliverableContentType('report.exe')).toBeNull();
  });
});
