export const MAX_REVIEW_ATTEMPTS = 3;
export const STALE_REVIEW_MS = 5 * 60_000;

export interface SubmissionPolicyState {
  decision: string | null;
  reviewStatus: string;
  reviewAttemptCount: number;
  reviewStartedAt: Date | null;
}

export function canActOnDeliverable(
  role: string | null | undefined,
  assigneeUserId: string | null,
  userId: string,
): boolean {
  return role === 'owner' || assigneeUserId === userId;
}

export function canSubmitDeliverable(latest: SubmissionPolicyState | undefined): boolean {
  return !latest || latest.decision === 'REQUEST_REVISION' || latest.decision === 'ACCEPT';
}

export function canReviewDeliverable(
  latest: SubmissionPolicyState | undefined,
  now = Date.now(),
): boolean {
  if (!latest || latest.decision || latest.reviewStatus === 'completed') return false;
  if (latest.reviewAttemptCount >= MAX_REVIEW_ATTEMPTS) return false;
  if (latest.reviewStatus !== 'pending') return true;
  return (
    latest.reviewStartedAt != null && latest.reviewStartedAt.getTime() <= now - STALE_REVIEW_MS
  );
}

export function canDecideDeliverable(
  role: string | null | undefined,
  latest: SubmissionPolicyState | undefined,
): boolean {
  return role === 'owner' && latest?.reviewStatus === 'completed' && latest.decision == null;
}

export function deliverableStatus(latest: SubmissionPolicyState | undefined) {
  if (!latest) return 'NOT_SUBMITTED' as const;
  if (latest.decision === 'ACCEPT') return 'ACCEPTED' as const;
  if (latest.decision === 'REQUEST_REVISION') return 'REVISION_REQUESTED' as const;
  if (latest.reviewStatus === 'completed') return 'AI_REVIEWED' as const;
  return 'SUBMITTED' as const;
}

export function deliverableContentType(filename: string): string | null {
  if (/\.pdf$/i.test(filename)) return 'application/pdf';
  if (/\.docx$/i.test(filename)) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}
