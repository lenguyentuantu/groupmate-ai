import { t } from 'elysia';

export const issueDeliverableParams = t.Object({ issueId: t.Numeric() });
export const submissionParams = t.Object({ submissionId: t.Numeric() });
export const deliverableUploadBody = t.Object({ file: t.File() });
export const deliverableDecisionBody = t.Object({
  decision: t.UnionEnum(['ACCEPT', 'REQUEST_REVISION']),
  comment: t.Optional(t.String({ maxLength: 10_000 })),
});

const CriterionResult = t.Object({
  criterion: t.String(),
  status: t.UnionEnum(['MET', 'PARTIAL', 'INSUFFICIENT_EVIDENCE']),
  explanation: t.String(),
  evidence: t.Optional(t.Nullable(t.String())),
});

const ReviewResult = t.Object({
  overallAssessment: t.String(),
  recommendation: t.UnionEnum(['ACCEPT', 'REQUEST_REVISION']),
  summary: t.String(),
  criteriaResults: t.Array(CriterionResult),
  missingRequirements: t.Array(t.String()),
  improvementSuggestions: t.Array(t.String()),
  model: t.String(),
  reviewedAt: t.String(),
});

export const DeliverableSubmissionResponse = t.Object({
  id: t.Number(),
  version: t.Number(),
  filename: t.String(),
  contentType: t.String(),
  sizeBytes: t.Number(),
  submittedBy: t.Object({ id: t.String(), name: t.String() }),
  submittedAt: t.String(),
  reviewStatus: t.UnionEnum(['not_requested', 'pending', 'completed', 'failed']),
  reviewAttemptCount: t.Number(),
  reviewResult: t.Nullable(ReviewResult),
  reviewError: t.Nullable(t.String()),
  decision: t.Nullable(t.UnionEnum(['ACCEPT', 'REQUEST_REVISION'])),
  decisionComment: t.Nullable(t.String()),
  decidedBy: t.Nullable(t.Object({ id: t.String(), name: t.String() })),
  decidedAt: t.Nullable(t.String()),
  fileUrl: t.String(),
});

export const DeliverableStateResponse = t.Object({
  status: t.UnionEnum([
    'NOT_SUBMITTED',
    'SUBMITTED',
    'AI_REVIEWED',
    'ACCEPTED',
    'REVISION_REQUESTED',
  ]),
  canSubmit: t.Boolean(),
  canReview: t.Boolean(),
  canDecide: t.Boolean(),
  submissions: t.Array(DeliverableSubmissionResponse),
});

export const ProjectDeliverableListResponse = t.Array(
  t.Object({
    issue: t.Object({
      id: t.Number(),
      identifier: t.String(),
      sequenceNumber: t.Number(),
      title: t.String(),
    }),
    submission: DeliverableSubmissionResponse,
  }),
);
