import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { db, deliverableSubmission, INSTANCE_AI_SECRET_KEY, writeSecret } from '@repo/db';
import { deleteObject } from '@repo/storage';
import { asc, eq } from 'drizzle-orm';
import { authedApi, createProject } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';
import { getMastra } from '#modules/agents/core/runtime/observability';
import { docx, paragraph } from '#modules/planning/__tests__/fixtures';

const originalFetch = globalThis.fetch;
const review = {
  overallAssessment: 'The submitted deliverable meets the requirements.',
  recommendation: 'ACCEPT',
  summary: 'The required lifecycle is documented.',
  criteriaResults: [
    {
      criterion: 'Document the requested lifecycle',
      status: 'MET',
      explanation: 'The document contains the requested lifecycle.',
      evidence: 'Lifecycle section',
    },
  ],
  missingRequirements: [],
  improvementSuggestions: [],
};

function mockOpenAiResponse(content: unknown): Response {
  return Response.json({
    id: 'resp_fixture',
    created_at: 0,
    model: 'gpt-5-mini',
    output: [
      {
        type: 'message',
        id: 'msg_fixture',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify(content),
            annotations: [],
          },
        ],
      },
    ],
  });
}

describe('deliverable revision lifecycle', () => {
  let aiRequests = 0;

  beforeEach(async () => {
    await resetDb();
    aiRequests = 0;
    await writeSecret(
      INSTANCE_AI_SECRET_KEY,
      {
        enabled: true,
        allowProjects: true,
        providerId: 'openai',
        model: 'gpt-5-mini',
        apiKey: 'test-only',
      },
      {
        enabled: true,
        allowProjects: true,
        providerId: 'openai',
        model: 'gpt-5-mini',
        hasApiKey: true,
      },
    );
    globalThis.fetch = Object.assign(
      async (input: Parameters<typeof fetch>[0]) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.origin !== 'https://api.openai.com') {
          throw new Error(`Unexpected fetch in deliverable lifecycle test: ${url.origin}`);
        }
        aiRequests += 1;
        return mockOpenAiResponse(review);
      },
      { preconnect: originalFetch.preconnect },
    );
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    const rows = await db.select({ key: deliverableSubmission.s3Key }).from(deliverableSubmission);
    for (const row of rows) await deleteObject(row.key);
    await getMastra().observability.flush();
  });

  it('preserves version 1 through revision and persists the accepted version 2', async () => {
    const leader = await signUpTestUser();
    const asLeader = authedApi(leader.cookie);
    await createProject(asLeader, { key: 'LIFE', name: 'Lifecycle' });

    const member = await signUpTestUser();
    const invite = await asLeader
      .projects({ projectKey: 'LIFE' })
      .invites.post({ email: member.email, role: 'member' });
    const asMember = authedApi(member.cookie);
    expect((await asMember.invites({ token: invite.data!.token }).accept.post()).status).toBe(200);

    const project = await asLeader.projects({ projectKey: 'LIFE' }).get();
    const createdIssue = await asLeader.projects({ projectKey: 'LIFE' }).issues.post({
      columnId: project.data!.columns[0].id,
      title: 'Document the deliverable lifecycle',
      description: '## Acceptance criteria\n- Document the requested lifecycle',
      assigneeUserId: member.userId,
    });
    const issueId = createdIssue.data!.id;
    const deliverable = asMember.issues({ issueId }).deliverable;

    const version1 = await deliverable.submissions.post({
      file: new File([docx(paragraph('Version one lifecycle'))], 'version-1.docx'),
    });
    expect(version1.status).toBe(201);
    expect(version1.data?.version).toBe(1);
    expect(
      (await asMember['deliverable-submissions']({ submissionId: version1.data!.id }).review.post())
        .status,
    ).toBe(200);
    expect(
      (
        await asMember['deliverable-submissions']({
          submissionId: version1.data!.id,
        }).decision.post({ decision: 'REQUEST_REVISION' })
      ).status,
    ).toBe(403);
    const revision = await asLeader['deliverable-submissions']({
      submissionId: version1.data!.id,
    }).decision.post({ decision: 'REQUEST_REVISION', comment: 'Submit version two.' });
    expect(revision.status).toBe(200);
    expect(revision.data?.decision).toBe('REQUEST_REVISION');

    const version2 = await deliverable.submissions.post({
      file: new File([docx(paragraph('Version two lifecycle'))], 'version-2.docx'),
    });
    expect(version2.status).toBe(201);
    expect(version2.data?.version).toBe(2);
    const beforeReview = await deliverable.get();
    expect(
      beforeReview.data?.submissions.map(({ version, decision }) => ({ version, decision })),
    ).toEqual([
      { version: 2, decision: null },
      { version: 1, decision: 'REQUEST_REVISION' },
    ]);

    const reviewed = await asMember['deliverable-submissions']({
      submissionId: version2.data!.id,
    }).review.post();
    expect(reviewed.status).toBe(200);
    expect(reviewed.data?.reviewStatus).toBe('completed');
    const accepted = await asLeader['deliverable-submissions']({
      submissionId: version2.data!.id,
    }).decision.post({ decision: 'ACCEPT', comment: 'Accepted.' });
    expect(accepted.status).toBe(200);
    expect(accepted.data?.decision).toBe('ACCEPT');

    const persisted = await db
      .select({
        id: deliverableSubmission.id,
        version: deliverableSubmission.version,
        reviewStatus: deliverableSubmission.reviewStatus,
        decision: deliverableSubmission.decision,
        submittedByUserId: deliverableSubmission.submittedByUserId,
      })
      .from(deliverableSubmission)
      .where(eq(deliverableSubmission.issueId, issueId))
      .orderBy(asc(deliverableSubmission.version));
    expect(persisted).toEqual([
      {
        id: version1.data!.id,
        version: 1,
        reviewStatus: 'completed',
        decision: 'REQUEST_REVISION',
        submittedByUserId: member.userId,
      },
      {
        id: version2.data!.id,
        version: 2,
        reviewStatus: 'completed',
        decision: 'ACCEPT',
        submittedByUserId: member.userId,
      },
    ]);
    expect((await asLeader.issues({ issueId }).deliverable.get()).data).toMatchObject({
      status: 'ACCEPTED',
      canSubmit: false,
      canReview: false,
      canDecide: false,
    });
    expect(aiRequests).toBe(2);
  });
});
