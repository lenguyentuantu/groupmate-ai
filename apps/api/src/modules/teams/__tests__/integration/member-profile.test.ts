import { beforeEach, describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { app, authedApi, createProject, type Api } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';
import { createAgent } from '#tests/helpers/agents';
import { createRole } from '#tests/helpers/roles';

const empty = { skills: [], weeklyAvailabilityMinutes: null, preferences: '' };

async function setup() {
  const owner = await signUpTestUser();
  const api = authedApi(owner.cookie);
  const created = await createProject(api, { key: 'MEM', name: 'Member intelligence' });
  const project = created.data!;
  const teamId = project.teamId;
  const profile = api.teams({ teamId }).members({ userId: owner.userId }).profile;
  return { owner, api, teamId, project, profile };
}

async function join(api: Api, teamId: number, role: 'manager' | 'member' = 'member') {
  const person = await signUpTestUser();
  const invite = await api.teams({ teamId }).invites.post({ email: person.email, role });
  expect(invite.status).toBe(201);
  const client = authedApi(person.cookie);
  expect((await client.invites({ token: invite.data!.token }).accept.post()).status).toBe(200);
  return { ...person, api: client };
}

describe('team member profiles', () => {
  beforeEach(resetDb);

  it('reads unknown defaults and persists normalized updates without changing project roles', async () => {
    const { owner, api, profile } = await setup();
    expect((await profile.get()).data).toMatchObject({
      ...empty,
      canEdit: true,
      workload: { activeTasks: 0, knownEstimateMinutes: 0, unknownEstimateTasks: 0 },
    });
    expect(
      (
        await profile.put({
          skills: [{ name: ' TypeScript ', proficiency: 5 }],
          weeklyAvailabilityMinutes: 600,
          preferences: ' Morning work ',
        })
      ).status,
    ).toBe(204);
    expect((await profile.get()).data).toMatchObject({
      skills: [{ name: 'TypeScript', proficiency: 5 }],
      weeklyAvailabilityMinutes: 600,
      preferences: 'Morning work',
    });
    const members = await api.projects({ projectKey: 'MEM' }).members.get();
    expect(members.data!.items.find((member) => member.userId === owner.userId)).toMatchObject({
      role: 'owner',
      description: '',
    });
  });

  it('distinguishes zero availability from unknown and clears skills and preferences', async () => {
    const { profile } = await setup();
    expect((await profile.put({ ...empty, weeklyAvailabilityMinutes: 0 })).status).toBe(204);
    expect((await profile.get()).data?.weeklyAvailabilityMinutes).toBe(0);
    expect(
      (await profile.put({ ...empty, skills: [{ name: 'Design', proficiency: 1 }] })).status,
    ).toBe(204);
    expect((await profile.put(empty)).status).toBe(204);
    expect((await profile.get()).data).toMatchObject(empty);
  });

  it('accepts maximum valid field values', async () => {
    const { profile } = await setup();
    const input = {
      skills: Array.from({ length: 30 }, (_, i) => ({
        name: `${i}`.padEnd(60, 'x'),
        proficiency: (i % 5) + 1,
      })),
      weeklyAvailabilityMinutes: 10080,
      preferences: 'x'.repeat(1000),
    };
    expect((await profile.put(input)).status).toBe(204);
    expect((await profile.get()).data).toMatchObject(input);
  });

  const invalid = [
    ['blank skill', { skills: [{ name: '  ', proficiency: 1 }] }],
    ['empty skill', { skills: [{ name: '', proficiency: 1 }] }],
    ['long skill', { skills: [{ name: 'x'.repeat(61), proficiency: 1 }] }],
    [
      'duplicate skills',
      {
        skills: [
          { name: 'React', proficiency: 2 },
          { name: ' react ', proficiency: 3 },
        ],
      },
    ],
    [
      'too many skills',
      { skills: Array.from({ length: 31 }, (_, i) => ({ name: String(i), proficiency: 1 })) },
    ],
    ['low proficiency', { skills: [{ name: 'React', proficiency: 0 }] }],
    ['high proficiency', { skills: [{ name: 'React', proficiency: 6 }] }],
    ['fractional proficiency', { skills: [{ name: 'React', proficiency: 1.5 }] }],
    ['negative availability', { weeklyAvailabilityMinutes: -1 }],
    ['excessive availability', { weeklyAvailabilityMinutes: 10081 }],
    ['fractional minutes', { weeklyAvailabilityMinutes: 1.5 }],
    ['long preferences', { preferences: 'x'.repeat(1001) }],
  ] as const;
  for (const [name, patch] of invalid) {
    it(`rejects ${name} without changing the stored profile`, async () => {
      const { profile } = await setup();
      expect((await profile.put({ ...empty, ...patch } as never)).status).toBe(400);
      expect((await profile.get()).data).toMatchObject(empty);
    });
  }

  it('allows self edits and manager edits, and denies a peer editing someone else', async () => {
    const { api, teamId, owner } = await setup();
    const member = await join(api, teamId);
    const manager = await join(api, teamId, 'manager');
    const own = member.api.teams({ teamId }).members({ userId: member.userId }).profile;
    expect((await own.get()).data?.canEdit).toBe(true);
    expect((await own.put({ ...empty, weeklyAvailabilityMinutes: 60 })).status).toBe(204);
    const other = member.api.teams({ teamId }).members({ userId: owner.userId }).profile;
    expect((await other.get()).data?.canEdit).toBe(false);
    expect((await other.put(empty)).status).toBe(403);
    expect(
      (
        await manager.api
          .teams({ teamId })
          .members({ userId: member.userId })
          .profile.put({ ...empty, weeklyAvailabilityMinutes: 120 })
      ).status,
    ).toBe(204);
    expect((await own.get()).data?.weeklyAvailabilityMinutes).toBe(120);
  });

  it('denies cross-team reads and writes and reports unknown members', async () => {
    const { api, teamId, owner, profile } = await setup();
    const outsider = await signUpTestUser();
    const foreign = authedApi(outsider.cookie)
      .teams({ teamId })
      .members({ userId: owner.userId }).profile;
    expect((await foreign.get()).status).toBe(404);
    expect((await foreign.put(empty)).status).toBe(404);
    for (const userId of ['missing', outsider.userId]) {
      const absent = api.teams({ teamId }).members({ userId }).profile;
      expect((await absent.get()).status).toBe(404);
      expect((await absent.put(empty)).status).toBe(404);
    }
    expect((await profile.get()).data).toMatchObject(empty);
  });

  it('keeps one person profiles independent between teams', async () => {
    const { api, teamId, owner, profile } = await setup();
    const other = await api.teams.post({
      name: 'Second team',
      slug: 'second-team',
      workspaceId: owner.workspaceId!,
    });
    expect(other.status).toBe(201);
    expect((await profile.put({ ...empty, weeklyAvailabilityMinutes: 300 })).status).toBe(204);
    const second = api.teams({ teamId: other.data!.id }).members({ userId: owner.userId }).profile;
    expect((await second.get()).data).toMatchObject(empty);
    expect((await second.put({ ...empty, weeklyAvailabilityMinutes: 120 })).status).toBe(204);
    expect(
      (await api.teams({ teamId }).members({ userId: owner.userId }).profile.get()).data
        ?.weeklyAvailabilityMinutes,
    ).toBe(300);
  });

  it('counts active assigned tasks, known zero estimates and unknown estimates', async () => {
    const { api, owner, teamId, project, profile } = await setup();
    const board = (await api.projects({ projectKey: 'MEM' }).get()).data!;
    const active = board.columns.find((column) => column.stateType === 'unstarted')!;
    const completed = board.columns.find((column) => column.stateType === 'completed')!;
    const canceled = (
      await api
        .projects({ projectKey: 'MEM' })
        .columns.post({ name: 'Canceled', stateType: 'canceled' })
    ).data!;
    for (const estimateMinutes of [60, 120, 0, undefined]) {
      expect(
        (
          await api.projects({ projectKey: 'MEM' }).issues.post({
            title: 'Active',
            columnId: active.id,
            assigneeUserId: owner.userId,
            estimateMinutes,
          })
        ).status,
      ).toBe(201);
    }
    for (const columnId of [completed.id, canceled.id]) {
      expect(
        (
          await api.projects({ projectKey: 'MEM' }).issues.post({
            title: 'Closed',
            columnId,
            assigneeUserId: owner.userId,
            estimateMinutes: 900,
          })
        ).status,
      ).toBe(201);
    }
    const archived = await api.projects({ projectKey: 'MEM' }).issues.post({
      title: 'Archived',
      columnId: active.id,
      assigneeUserId: owner.userId,
      estimateMinutes: 900,
    });
    expect((await api.issues({ issueId: archived.data!.id }).archive.post()).status).toBe(200);
    expect(
      (
        await api
          .projects({ projectKey: 'MEM' })
          .issues.post({ title: 'Unassigned', columnId: active.id, estimateMinutes: 900 })
      ).status,
    ).toBe(201);
    expect((await profile.get()).data?.workload).toEqual({
      activeTasks: 4,
      knownEstimateMinutes: 180,
      unknownEstimateTasks: 1,
    });
    expect(
      (await api.teams({ teamId }).projects({ projectId: project.id }).archive.post()).status,
    ).toBe(200);
    expect((await profile.get()).data?.workload).toEqual({
      activeTasks: 0,
      knownEstimateMinutes: 0,
      unknownEstimateTasks: 0,
    });
  });

  it('includes only readable projects in the same team', async () => {
    const { api, owner, teamId, profile } = await setup();
    const member = await join(api, teamId);
    expect(
      (
        await api
          .projects({ projectKey: 'MEM' })
          .members.post({ userId: member.userId, role: 'member' })
      ).status,
    ).toBe(204);
    await createProject(api, { key: 'PRIVATE', name: 'Private' });
    for (const projectKey of ['MEM', 'PRIVATE']) {
      const columnId = (await api.projects({ projectKey }).get()).data!.columns[0].id;
      expect(
        (
          await api.projects({ projectKey }).issues.post({
            columnId,
            title: 'Assigned',
            assigneeUserId: owner.userId,
            estimateMinutes: 60,
          })
        ).status,
      ).toBe(201);
    }
    const read = member.api.teams({ teamId }).members({ userId: owner.userId }).profile;
    expect((await read.get()).data?.workload.activeTasks).toBe(1);
    expect((await profile.get()).data?.workload.activeTasks).toBe(2);
    const role = await createRole(api, 'MEM', {
      name: 'No work items',
      permissions: { work_items: { read: false } },
    });
    expect(
      (
        await api
          .projects({ projectKey: 'MEM' })
          .members({ userId: member.userId })
          .patch({ role: 'member', roleId: role.data!.id })
      ).status,
    ).toBe(204);
    expect((await read.get()).data?.workload.activeTasks).toBe(0);
  });

  it('restricts project-bound agents to project members and workload and refuses edits', async () => {
    const { api, owner, teamId, project } = await setup();
    const member = await join(api, teamId);
    await createProject(api, { key: 'OTHER', name: 'Other' });
    for (const projectKey of ['MEM', 'OTHER']) {
      const columnId = (await api.projects({ projectKey }).get()).data!.columns[0].id;
      await api.projects({ projectKey }).issues.post({
        columnId,
        title: 'Task',
        assigneeUserId: owner.userId,
        estimateMinutes: 60,
      });
    }
    const created = await createAgent(api, 'MEM', {
      name: 'Reader',
      username: 'profile-reader',
      kind: 'external',
    });
    const agent = treaty(app, {
      headers: { 'x-api-key': created.data!.apiKey!, 'x-agent-project': String(project.id) },
    });
    const read = agent.teams({ teamId }).members({ userId: owner.userId }).profile;
    expect((await read.get()).data).toMatchObject({
      canEdit: false,
      workload: { activeTasks: 1, knownEstimateMinutes: 60 },
    });
    expect((await read.put(empty)).status).toBe(403);
    expect(
      (await agent.teams({ teamId }).members({ userId: member.userId }).profile.get()).status,
    ).toBe(404);
    expect(
      (await api.teams({ teamId }).members({ userId: created.data!.agent.userId }).profile.get())
        .status,
    ).toBe(404);
    const unbound = treaty(app, { headers: { 'x-api-key': created.data!.apiKey! } });
    expect(
      (await unbound.teams({ teamId }).members({ userId: owner.userId }).profile.put(empty)).status,
    ).toBe(403);
  });
});
