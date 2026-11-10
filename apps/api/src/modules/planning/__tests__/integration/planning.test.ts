import { beforeEach, describe, expect, it } from 'bun:test';
import { db, issue } from '@repo/db';
import { app, authedApi, createProject } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';
import { createRole } from '#tests/helpers/roles';

const content = {
  title: 'Website',
  brief: 'Build a website',
  objectives: [],
  deadline: null,
  assumptions: [],
  questions: [],
  tasks: [],
};
async function setup() {
  const user = await signUpTestUser();
  const api = authedApi(user.cookie);
  const created = await createProject(api, { key: 'PLAN', name: 'Planning' });
  return {
    api,
    user,
    project: created.data!,
    routes: api.projects({ projectKey: created.data!.ref }).planning,
  };
}
describe('planning drafts', () => {
  beforeEach(resetDb);
  it('enforces read-only permissions on saving, uploading and generating', async () => {
    const { api, project, routes } = await setup();
    const person = await signUpTestUser();
    const member = authedApi(person.cookie);
    const invite = await api
      .teams({ teamId: project.teamId })
      .invites.post({ email: person.email, role: 'member' });
    expect((await member.invites({ token: invite.data!.token }).accept.post()).status).toBe(200);
    const role = await createRole(api, 'PLAN', {
      name: 'Planning reader',
      permissions: {
        documents: { read: true, create: false, edit: false },
        ai_agents: { read: false },
      },
    });
    expect(
      (
        await api
          .projects({ projectKey: project.ref })
          .members.post({ userId: person.userId, role: 'member', roleId: role.data!.id })
      ).status,
    ).toBe(204);
    const draft = (await routes.post({ content, attachmentIds: [] })).data!;
    const reader = member.projects({ projectKey: project.ref }).planning;
    expect((await reader({ draftId: draft.id }).get()).status).toBe(200);
    expect((await reader.post({ content, attachmentIds: [] })).status).toBe(403);
    expect(
      (await reader({ draftId: draft.id }).put({ content, attachmentIds: [], version: 1 })).status,
    ).toBe(403);
    expect(
      (await reader.sources.post({ filename: 'file.docx', contentBase64: 'YQ==' })).status,
    ).toBe(403);
    expect(
      (await reader({ draftId: draft.id }).generate.post({ agentId: 1, version: 1 })).status,
    ).toBe(403);
  });
  it('saves, reopens, edits and reads immutable revisions without creating issues', async () => {
    const { routes } = await setup();
    const created = await routes.post({ content, attachmentIds: [] });
    expect(created.status).toBe(201);
    const id = created.data!.id;
    expect(created.data!.status).toBe('draft');
    expect((await routes({ draftId: id }).get()).data?.content).toEqual(content);
    const saved = await routes({ draftId: id }).put({
      content: { ...content, title: 'Updated' },
      attachmentIds: [],
      version: 1,
    });
    expect(saved.status).toBe(200);
    expect(saved.data!.version).toBe(2);
    expect((await routes({ draftId: id }).revisions.get()).data?.total).toBe(2);
    expect((await routes({ draftId: id }).revisions({ version: 1 }).get()).data?.content).toEqual(
      content,
    );
    expect((await routes.get()).data?.total).toBe(1);
    expect(await db.select().from(issue)).toHaveLength(0);
  });
  it('rejects stale writes and concurrent overwrites', async () => {
    const { routes } = await setup();
    const created = await routes.post({ content, attachmentIds: [] });
    const endpoint = routes({ draftId: created.data!.id });
    const results = await Promise.all([
      endpoint.put({ content, attachmentIds: [], version: 1 }),
      endpoint.put({ content, attachmentIds: [], version: 1 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await endpoint.revisions.get()).data?.total).toBe(2);
  });
  it('isolates drafts across projects and users', async () => {
    const { api, user, project, routes } = await setup();
    const bound = await app.handle(
      new Request(`http://localhost/projects/${project.ref}/planning`, {
        headers: { cookie: user.cookie, 'x-agent-project': String(project.id) },
      }),
    );
    expect(bound.status).toBe(403);
    const created = await routes.post({ content, attachmentIds: [] });
    const second = await createProject(api, { key: 'OTHER', name: 'Other' });
    const other = api
      .projects({ projectKey: second.data!.ref })
      .planning({ draftId: created.data!.id });
    expect((await other.get()).status).toBe(404);
    expect((await other.put({ content, attachmentIds: [], version: 1 })).status).toBe(404);
    expect((await other.revisions({ version: 1 }).get()).status).toBe(404);
    const outsider = await signUpTestUser();
    const client = authedApi(outsider.cookie);
    const first = (await routes.get()).data!.items[0];
    const req = await app.handle(
      new Request(`http://localhost/projects/${second.data!.ref}/planning/${first.id}`, {
        headers: { cookie: outsider.cookie },
      }),
    );
    expect(req.status).toBe(403);
    expect(
      (
        await client
          .projects({ projectKey: second.data!.ref })
          .planning.post({ content, attachmentIds: [] })
      ).status,
    ).toBe(403);
  });
  it('rejects missing files, invalid structures and unavailable agents without modifying the draft', async () => {
    const { routes } = await setup();
    expect((await routes.post({ content, attachmentIds: ['missing'] })).status).toBe(400);
    expect(
      (await routes.post({ content, attachmentIds: ['00000000-0000-4000-8000-000000000000'] }))
        .status,
    ).toBe(404);
    expect(
      (await routes.post({ content: { ...content, title: '' }, attachmentIds: [] })).status,
    ).toBe(400);
    const created = await routes.post({ content, attachmentIds: [] });
    const endpoint = routes({ draftId: created.data!.id });
    expect((await endpoint.generate.post({ agentId: 999999, version: 1 })).status).toBe(400);
    expect((await endpoint.generate.post({ agentId: 999999, version: 2 })).status).toBe(409);
    expect((await endpoint.get()).data?.version).toBe(1);
    expect(await db.select().from(issue)).toHaveLength(0);
    expect((await routes({ draftId: 999999 }).get()).status).toBe(404);
  });
});
