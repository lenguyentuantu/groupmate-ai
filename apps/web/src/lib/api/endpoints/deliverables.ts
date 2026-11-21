import { API_URL, request, uploadFile } from '@/lib/api/core/client';

export type DeliverableDecision = 'ACCEPT' | 'REQUEST_REVISION';
export type DeliverableReviewStatus = 'not_requested' | 'pending' | 'completed' | 'failed';

export interface DeliverableReview {
  overallAssessment: string;
  recommendation: DeliverableDecision;
  summary: string;
  criteriaResults: Array<{
    criterion: string;
    status: 'MET' | 'PARTIAL' | 'INSUFFICIENT_EVIDENCE';
    explanation: string;
    evidence?: string | null;
  }>;
  missingRequirements: string[];
  improvementSuggestions: string[];
  model: string;
  reviewedAt: string;
}

export interface DeliverableSubmission {
  id: number;
  version: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  submittedBy: { id: string; name: string };
  submittedAt: string;
  reviewStatus: DeliverableReviewStatus;
  reviewAttemptCount: number;
  reviewResult: DeliverableReview | null;
  reviewError: string | null;
  decision: DeliverableDecision | null;
  decisionComment: string | null;
  decidedBy: { id: string; name: string } | null;
  decidedAt: string | null;
  fileUrl: string;
}

export interface DeliverableState {
  status: 'NOT_SUBMITTED' | 'SUBMITTED' | 'AI_REVIEWED' | 'ACCEPTED' | 'REVISION_REQUESTED';
  canSubmit: boolean;
  canReview: boolean;
  canDecide: boolean;
  submissions: DeliverableSubmission[];
}

export interface ProjectDeliverable {
  issue: { id: number; identifier: string; sequenceNumber: number; title: string };
  submission: DeliverableSubmission;
}

export const deliverableDownloadUrl = (path: string) => `${API_URL}${path}`;
export const getDeliverableState = (issueId: number) =>
  request<DeliverableState>(`/issues/${issueId}/deliverable`);
export const listProjectDeliverables = (projectKey: string) =>
  request<ProjectDeliverable[]>(`/projects/${projectKey}/deliverables`);
export const submitDeliverable = (issueId: number, file: File) =>
  uploadFile<DeliverableSubmission>(`/issues/${issueId}/deliverable/submissions`, 'POST', file);
export const reviewDeliverable = (submissionId: number) =>
  request<DeliverableSubmission>(`/deliverable-submissions/${submissionId}/review`, {
    method: 'POST',
  });
export const decideDeliverable = (
  submissionId: number,
  decision: DeliverableDecision,
  comment?: string,
) =>
  request<DeliverableSubmission>(`/deliverable-submissions/${submissionId}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, comment }),
  });
