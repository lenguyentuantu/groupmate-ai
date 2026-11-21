import { Elysia } from 'elysia';
import { authContext } from '#shared/auth-context';
import { requireUser } from '#shared/access';
import { entityGuard, guards } from '#shared/guards';
import { HttpError } from '#shared/lib';
import { commonErrors, errors } from '#shared/responses';
import { getIssueProjectId } from '#modules/issues/service';
import { attachmentObjectResponse } from '#modules/attachments/storage';
import {
  DeliverableStateResponse,
  DeliverableSubmissionResponse,
  ProjectDeliverableListResponse,
  deliverableDecisionBody,
  deliverableUploadBody,
  issueDeliverableParams,
  submissionParams,
} from './model';
import {
  createSubmission,
  decideSubmission,
  getDeliverableProjectId,
  getDeliverableState,
  getSubmissionFile,
  listProjectDeliverables,
  reviewSubmission,
} from './service';

export const deliverableRoutes = new Elysia({
  name: 'deliverables',
  detail: { tags: ['Deliverables'] },
})
  .use(authContext)
  .use(guards)
  .macro({
    issueDeliverable: entityGuard('work_items', 'Issue not found', (params) =>
      getIssueProjectId(Number(params.issueId)),
    ),
    submission: entityGuard('work_items', 'Deliverable submission not found', (params) =>
      getDeliverableProjectId(Number(params.submissionId)),
    ),
  })
  .get('/projects/:projectKey/deliverables', ({ project }) => listProjectDeliverables(project.id), {
    permission: ['work_items', 'read'],
    response: { 200: ProjectDeliverableListResponse, ...commonErrors },
    detail: { summary: 'List project deliverable submissions' },
  })
  .get(
    '/issues/:issueId/deliverable',
    ({ params, user }) => getDeliverableState(params.issueId, requireUser(user)),
    {
      params: issueDeliverableParams,
      issueDeliverable: 'read',
      response: { 200: DeliverableStateResponse, ...commonErrors },
      detail: { summary: 'Get deliverable submission history' },
    },
  )
  .post(
    '/issues/:issueId/deliverable/submissions',
    async ({ params, body, user, set }) => {
      if (!(body.file instanceof File)) throw new HttpError(400, 'No deliverable file uploaded');
      const result = await createSubmission(params.issueId, body.file, requireUser(user));
      set.status = 201;
      return result;
    },
    {
      params: issueDeliverableParams,
      body: deliverableUploadBody,
      issueDeliverable: 'edit',
      response: {
        201: DeliverableSubmissionResponse,
        ...commonErrors,
        ...errors(409, 413, 502),
      },
      detail: { summary: 'Submit a deliverable' },
    },
  )
  .get(
    '/deliverable-submissions/:submissionId/file',
    async ({ params, request }) => {
      const row = await getSubmissionFile(params.submissionId);
      return attachmentObjectResponse({
        s3Key: row.s3Key,
        contentType: row.contentType,
        filename: row.filename,
        request,
        download: true,
      });
    },
    {
      params: submissionParams,
      submission: 'read',
      detail: { summary: 'Download a submitted deliverable' },
    },
  )
  .post(
    '/deliverable-submissions/:submissionId/review',
    ({ params, user }) => reviewSubmission(params.submissionId, requireUser(user)),
    {
      params: submissionParams,
      submission: 'edit',
      response: {
        200: DeliverableSubmissionResponse,
        ...commonErrors,
        ...errors(409, 429, 502, 503, 504),
      },
      detail: { summary: 'Review a submitted deliverable with built-in AI' },
    },
  )
  .post(
    '/deliverable-submissions/:submissionId/decision',
    ({ params, body, user }) => decideSubmission(params.submissionId, body, requireUser(user)),
    {
      params: submissionParams,
      body: deliverableDecisionBody,
      submission: 'read',
      response: { 200: DeliverableSubmissionResponse, ...commonErrors, ...errors(409) },
      detail: { summary: 'Accept a deliverable or request revision' },
    },
  );
