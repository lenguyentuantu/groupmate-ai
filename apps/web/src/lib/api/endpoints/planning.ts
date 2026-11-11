import { ApiError, request } from '@/lib/api/core/client';
import { pageQuery, type Page, type PageParams } from '@/lib/api/core/paging';

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  deliverable: string;
  parentId: string | null;
  acceptanceCriteria: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  requiredSkills: string[];
  estimateMinutes: number | null;
  dependencyIds: string[];
  sourceRefs: string[];
}
export interface Plan {
  title: string;
  brief: string;
  objectives: string[];
  deadline: string | null;
  assumptions: string[];
  questions: string[];
  tasks: PlanTask[];
}
export interface PlanSource {
  attachmentId: string;
  filename: string;
  blocks: { ref: string; text: string }[];
}
export interface SourceAssessment {
  attachmentId: string;
  classification: 'requirements' | 'reference_only' | 'irrelevant';
  explanation: string;
  relevantBlockRefs: string[];
}
export interface PlanDraft {
  id: number;
  projectId: number;
  version: number;
  status: 'draft';
  title: string;
  content: Plan;
  sources: PlanSource[];
  updatedAt: string;
}
export interface PlanRevision {
  version: number;
  createdAt: string;
  createdByUserId: string | null;
  content: Plan;
  sources: PlanSource[];
}
export interface PlanningCandidate {
  id: string;
  name: string;
  isRealMember: boolean;
  skills: string[];
  weeklyCapacityMinutes: number | null;
  knownWorkloadMinutes: number | null;
  unknownWorkloadTasks: number;
}
export interface ProposalAssignment {
  taskId: string;
  candidateId: string | null;
  matchingSkills: string[];
  missingSkills: string[];
  reason: string;
  warning: string | null;
  allocatedMinutes: number;
  remainingCapacityMinutes: number | null;
}
export interface PlanningProposal {
  id?: number;
  draftId?: number;
  version?: number;
  sourceVersion: number;
  stale?: boolean;
  candidates: PlanningCandidate[];
  assignments: ProposalAssignment[];
  schedule: {
    taskId: string;
    order: number;
    relativeWeek: number | null;
    dependencyTaskIds: string[];
    canRunInParallel: boolean;
  }[];
  warnings: string[];
  aiEnrichment?: 'applied' | 'not_requested' | 'failed';
  updatedAt?: string;
}
export interface ReadinessIssue {
  code: string;
  severity: 'blocker' | 'risk';
  affectedTaskIds: string[];
  explanation: string;
  nextAction: string;
}
export interface ExecutionBaselineTask {
  sourceTaskId: string;
  workPackageId: string | null;
  title: string;
  description: string;
  priority: PlanTask['priority'];
  estimateMinutes: number | null;
  deliverable: string;
  acceptanceCriteria: string[];
  requiredSkills: string[];
  sourceRefs: string[];
  assigneeUserId: string | null;
  dependencyTaskIds: string[];
  relativeWeek: number | null;
}
export interface ExecutionBaseline {
  project: { id: number; teamId: number; key: string; name: string };
  source: { draftId: number; wbsVersion: number; proposalId: number; proposalVersion: number };
  title: string;
  deadline: string | null;
  assumptions: string[];
  readinessRisks: ReadinessIssue[];
  workPackages: {
    sourceTaskId: string;
    title: string;
    deliverable: string;
    actionableTaskIds: string[];
  }[];
  tasks: ExecutionBaselineTask[];
  execution: {
    readyTaskIds: string[];
    phases: { order: number; taskIds: string[] }[];
    parallelTaskGroups: string[][];
    bottleneckTaskIds: string[];
  };
  checkpoints: {
    sourceWorkPackageId: string;
    title: string;
    deliverable: string;
    taskIds: string[];
  }[];
  mappingStrategy: string;
}
export interface LaunchPreview {
  status: 'blocked' | 'needs_review' | 'ready';
  blockers: ReadinessIssue[];
  risks: ReadinessIssue[];
  recommendations: { issueCode: string; action: string; affectedTaskIds: string[] }[];
  source: ExecutionBaseline['source'] | null;
  summary: {
    actionableTaskCount: number;
    aggregateWorkPackageCount: number;
    assignedTaskCount: number;
    unassignedTaskCount: number;
    knownEffortMinutes: number;
    unknownEstimateTaskCount: number;
    knownAllocations: {
      memberId: string;
      memberName: string;
      minutes: number;
      unknownEstimateTaskCount: number;
      weeklyCapacityMinutes: number | null;
      existingKnownWorkloadMinutes: number | null;
      unknownWorkloadTasks: number;
    }[];
    credibleExecutionPlan: boolean;
  };
  baseline: ExecutionBaseline | null;
}
export interface ApprovalReceipt {
  id: number;
  projectId: number;
  draftId: number;
  wbsVersion: number;
  proposalId: number;
  proposalVersion: number;
  intentId: string;
  approvedByUserId: string;
  approvedByUserName: string;
  approvedAt: string;
  acknowledgedRiskCodes: string[];
  baseline: ExecutionBaseline;
  workItemMappings: {
    sourceTaskId: string;
    workItemId: number;
    sequenceNumber: number;
    dependencyWorkItemIds: number[];
  }[];
}
interface SavedPlanningProposalResponse {
  id: number;
  draftId: number;
  version: number;
  sourceVersion: number;
  stale: boolean;
  content: unknown;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value))
    throw new Error(`Invalid planning proposal: ${field} must be an array`);
  return value;
}

export function normalizePlanningProposalResponse(value: unknown): PlanningProposal {
  const saved = isRecord(value) && 'content' in value;
  const metadata = saved && isRecord(value) ? value : {};
  const content = saved ? metadata.content : value;
  if (!isRecord(content)) throw new Error('Invalid planning proposal: content is required');
  const assignments = requireArray(content.assignments, 'assignments');
  const candidates = requireArray(content.candidates, 'candidates');
  const schedule = requireArray(content.schedule, 'schedule');
  const warnings = content.warnings === undefined ? [] : requireArray(content.warnings, 'warnings');
  if (
    (saved &&
      (typeof metadata.id !== 'number' ||
        typeof metadata.draftId !== 'number' ||
        typeof metadata.version !== 'number' ||
        typeof metadata.sourceVersion !== 'number' ||
        typeof metadata.stale !== 'boolean' ||
        typeof metadata.updatedAt !== 'string')) ||
    typeof content.sourceVersion !== 'number'
  )
    throw new Error('Invalid planning proposal metadata');
  return {
    ...(saved
      ? {
          id: metadata.id as number,
          draftId: metadata.draftId as number,
          version: metadata.version as number,
          sourceVersion: metadata.sourceVersion as number,
          stale: metadata.stale as boolean,
          updatedAt: metadata.updatedAt as string,
        }
      : { sourceVersion: content.sourceVersion as number }),
    candidates: candidates as PlanningCandidate[],
    assignments: assignments as ProposalAssignment[],
    schedule: schedule as PlanningProposal['schedule'],
    warnings: warnings as string[],
    ...(content.aiEnrichment !== undefined
      ? { aiEnrichment: content.aiEnrichment as PlanningProposal['aiEnrichment'] }
      : {}),
  };
}

export function summarizePlanningWarnings(warnings: string[]) {
  const counts = new Map<string, number>();
  for (const warning of warnings) counts.set(warning, (counts.get(warning) ?? 0) + 1);
  return [...counts].map(([message, count]) => ({ message, count }));
}

const base = (ref: string) => `/projects/${encodeURIComponent(ref)}/planning`;
export const listPlanDrafts = (ref: string, page: PageParams) =>
  request<Page<Pick<PlanDraft, 'id' | 'title' | 'version' | 'updatedAt'>>>(
    `${base(ref)}${pageQuery(page)}`,
  );
export const getPlanDraft = (ref: string, id: number) => request<PlanDraft>(`${base(ref)}/${id}`);
export const savePlanDraft = (
  ref: string,
  input: { content: Plan; attachmentIds: string[]; version?: number },
  id?: number,
) =>
  request<PlanDraft>(`${base(ref)}${id ? `/${id}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  });
export const listPlanRevisions = (ref: string, id: number, page: PageParams) =>
  request<Page<Omit<PlanRevision, 'content' | 'sources'>>>(
    `${base(ref)}/${id}/revisions${pageQuery(page)}`,
  );
export const getPlanRevision = (ref: string, id: number, version: number) =>
  request<PlanRevision>(`${base(ref)}/${id}/revisions/${version}`);
export const listPlanSources = (ref: string, page: PageParams) =>
  request<Page<Pick<PlanSource, 'attachmentId' | 'filename'>>>(
    `${base(ref)}/sources${pageQuery(page)}`,
  );
export const uploadPlanSource = (ref: string, input: { filename: string; contentBase64: string }) =>
  request<PlanSource>(`${base(ref)}/sources`, { method: 'POST', body: JSON.stringify(input) });
export const generatePlan = (ref: string, id: number, agentId: number, version: number) =>
  request<{ content: Plan; sourceAssessments: SourceAssessment[]; version: number }>(
    `${base(ref)}/${id}/generate`,
    {
      method: 'POST',
      body: JSON.stringify({ agentId, version }),
    },
  );
export const getAssignmentInputs = (ref: string, id: number) =>
  request<{
    draftId: number;
    sourceVersion: number;
    tasks: PlanTask[];
    candidates: PlanningCandidate[];
  }>(`${base(ref)}/${id}/assignment-inputs`);
export const getAssignmentProposal = (ref: string, id: number) =>
  request<SavedPlanningProposalResponse | null>(`${base(ref)}/${id}/proposal`).then((value) =>
    value === null ? null : normalizePlanningProposalResponse(value),
  );
export const generateAssignmentProposal = (
  ref: string,
  id: number,
  input: {
    sourceVersion: number;
    agentId?: number;
    provisionalCandidates?: PlanningCandidate[];
    overrides?: Record<string, string | null>;
  },
) =>
  request<unknown>(`${base(ref)}/${id}/proposal/generate`, {
    method: 'POST',
    body: JSON.stringify(input),
  }).then(normalizePlanningProposalResponse);
export const saveAssignmentProposal = (
  ref: string,
  id: number,
  input: {
    sourceVersion: number;
    provisionalCandidates?: PlanningCandidate[];
    overrides?: Record<string, string | null>;
    proposal?: PlanningProposal;
    version?: number;
  },
) =>
  request<unknown>(`${base(ref)}/${id}/proposal`, {
    method: 'PUT',
    body: JSON.stringify(input),
  }).then(normalizePlanningProposalResponse);
export const getLaunchPreview = (ref: string, id: number) =>
  request<LaunchPreview>(`${base(ref)}/${id}/launch-preview`);
export const getLaunchReceipt = (ref: string, id: number) =>
  request<ApprovalReceipt>(`${base(ref)}/${id}/launch-receipt`).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
export const approveLaunch = (
  ref: string,
  id: number,
  input: {
    wbsVersion: number;
    proposalVersion: number;
    intentId: string;
    acknowledgedRiskCodes: string[];
  },
) =>
  request<ApprovalReceipt>(`${base(ref)}/${id}/launch`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
