import { t } from 'elysia';
import { pageQueryFields, pageResponse } from '#shared/pagination';

export const projectParams = t.Object({ projectKey: t.String() });
export const draftParams = t.Object({ projectKey: t.String(), draftId: t.Numeric({ minimum: 1 }) });
export const revisionParams = t.Object({
  ...draftParams.properties,
  version: t.Numeric({ minimum: 1 }),
});
export const listQuery = t.Object(pageQueryFields);
export const draftBody = t.Object({
  content: t.Any(),
  attachmentIds: t.Array(t.String({ format: 'uuid' }), { maxItems: 3 }),
});
export const updateBody = t.Object({ ...draftBody.properties, version: t.Integer({ minimum: 1 }) });
export const generateBody = t.Object({
  agentId: t.Integer({ minimum: 1 }),
  version: t.Integer({ minimum: 1 }),
});
export const uploadBody = t.Object({
  filename: t.String({ minLength: 1, maxLength: 255 }),
  contentBase64: t.String({ maxLength: 14000000 }),
});
export const draftResponse = t.Object({
  id: t.Number(),
  projectId: t.Number(),
  version: t.Number(),
  status: t.Literal('draft'),
  title: t.String(),
  content: t.Any(),
  sources: t.Any(),
  updatedAt: t.String(),
});
export const summaryResponse = t.Object({
  id: t.Number(),
  title: t.String(),
  version: t.Number(),
  updatedAt: t.String(),
});
export const draftListResponse = pageResponse(summaryResponse);
export const revisionResponse = t.Object({
  version: t.Number(),
  createdAt: t.String(),
  createdByUserId: t.Nullable(t.String()),
  content: t.Any(),
  sources: t.Any(),
});
export const revisionListResponse = pageResponse(
  t.Object({ version: t.Number(), createdAt: t.String(), createdByUserId: t.Nullable(t.String()) }),
);
