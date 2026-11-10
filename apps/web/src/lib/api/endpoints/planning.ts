import { request } from '@/lib/api/core/client';
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
