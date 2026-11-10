import { Elysia, t } from 'elysia';
import { authContext } from '#shared/auth-context';
import { guards } from '#shared/guards';
import { assertPermission, requireUser } from '#shared/access';
import { commonErrors, errors } from '#shared/responses';
import { paginate, pageResponse } from '#shared/pagination';
import * as model from './model';
import { getDraft, saveDraft, listDrafts, listRevisions, getRevision } from './service';
import { listSources, uploadSource } from './sources';
import { generateDraft } from './generation';
import { boundProjectId } from '#shared/mcp-request';
import { HttpError } from '#shared/lib';

export const planningRoutes = new Elysia({ name: 'planning', detail: { tags: ['Planning'] } })
  .use(authContext)
  .use(guards)
  .onBeforeHandle(({ request }) => {
    if (boundProjectId(request.headers) !== null)
      throw new HttpError(
        403,
        'Planning is available through the human review interface, not agent tools',
      );
  })
  .get(
    '/projects/:projectKey/planning',
    ({ project, query }) => paginate(query, (window) => listDrafts(project.id, window)),
    {
      params: model.projectParams,
      query: model.listQuery,
      permission: ['documents', 'read'],
      response: { 200: model.draftListResponse, ...commonErrors },
      detail: { summary: 'List planning drafts' },
    },
  )
  .post(
    '/projects/:projectKey/planning',
    async ({ project, user, body, set }) => {
      const saved = await saveDraft(project.id, requireUser(user).id, body);
      set.status = 201;
      return saved;
    },
    {
      params: model.projectParams,
      body: model.draftBody,
      permission: ['documents', 'create'],
      response: { 201: model.draftResponse, ...commonErrors },
      detail: { summary: 'Save a new planning draft without creating work items' },
    },
  )
  .get(
    '/projects/:projectKey/planning/sources',
    ({ project, query }) => paginate(query, (window) => listSources(project.id, window)),
    {
      params: model.projectParams,
      query: model.listQuery,
      permission: ['documents', 'read'],
      response: {
        200: pageResponse(t.Object({ attachmentId: t.String(), filename: t.String() })),
        ...commonErrors,
      },
      detail: { summary: 'List project planning source files' },
    },
  )
  .post(
    '/projects/:projectKey/planning/sources',
    ({ project, user, body }) => uploadSource(project.id, requireUser(user).id, body),
    {
      params: model.projectParams,
      body: model.uploadBody,
      permission: ['documents', 'create'],
      response: { 200: t.Any(), ...commonErrors, ...errors(502) },
      detail: { summary: 'Validate and store a PDF or DOCX planning source' },
    },
  )
  .get(
    '/projects/:projectKey/planning/:draftId',
    ({ project, params }) => getDraft(project.id, params.draftId),
    {
      params: model.draftParams,
      permission: ['documents', 'read'],
      response: { 200: model.draftResponse, ...commonErrors },
      detail: { summary: 'Read a planning draft' },
    },
  )
  .put(
    '/projects/:projectKey/planning/:draftId',
    ({ project, user, params, body }) =>
      saveDraft(project.id, requireUser(user).id, body, params.draftId),
    {
      params: model.draftParams,
      body: model.updateBody,
      permission: ['documents', 'edit'],
      response: { 200: model.draftResponse, ...commonErrors, ...errors(409) },
      detail: { summary: 'Save a new planning revision with optimistic concurrency' },
    },
  )
  .get(
    '/projects/:projectKey/planning/:draftId/revisions',
    ({ project, params, query }) =>
      paginate(query, (window) => listRevisions(project.id, params.draftId, window)),
    {
      params: model.draftParams,
      query: model.listQuery,
      permission: ['documents', 'read'],
      response: { 200: model.revisionListResponse, ...commonErrors },
      detail: { summary: 'List planning revision history' },
    },
  )
  .get(
    '/projects/:projectKey/planning/:draftId/revisions/:version',
    ({ project, params }) => getRevision(project.id, params.draftId, params.version),
    {
      params: model.revisionParams,
      permission: ['documents', 'read'],
      response: { 200: model.revisionResponse, ...commonErrors },
      detail: { summary: 'Read a planning revision' },
    },
  )
  .post(
    '/projects/:projectKey/planning/:draftId/generate',
    async ({ project, params, user, body }) => {
      const actor = requireUser(user);
      await assertPermission(project.id, actor, 'ai_agents', 'read');
      return generateDraft(project.id, params.draftId, actor.id, body);
    },
    {
      params: model.draftParams,
      body: model.generateBody,
      permission: ['documents', 'edit'],
      response: {
        200: t.Object({ content: t.Any(), sourceAssessments: t.Any(), version: t.Number() }),
        ...commonErrors,
        ...errors(409, 502, 504),
      },
      detail: {
        summary: 'Explicitly generate a WBS preview without changing the saved draft or work items',
      },
    },
  );
