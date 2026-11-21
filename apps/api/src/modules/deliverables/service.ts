import { db, deliverableSubmission, issue, project, user, type DbExecutor } from '@repo/db';
import { getObject } from '@repo/storage';
import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { getProjectAccess, assertProjectOwner, type AuthUser } from '#shared/access';
import { HttpError } from '#shared/lib';
import {
  assertAttachmentStorageCapacity,
  attachmentObjectKey,
  deleteAttachmentObject,
  safeAttachmentFilename,
  storeAttachmentObject,
  lockAttachmentStorage,
} from '#modules/attachments/storage';
import { extractDocument } from '#modules/planning/extract';
import { generateDeliverableReview } from './reviewer';
import type { DeliverableReviewContent } from './review-contract';
import {
  canActOnDeliverable,
  canDecideDeliverable,
  canReviewDeliverable,
  canSubmitDeliverable,
  deliverableContentType,
  deliverableStatus,
  MAX_REVIEW_ATTEMPTS,
  STALE_REVIEW_MS,
} from './policy';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_CHARS = 100_000;
const MAX_CONCURRENT_REVIEWS = 3;
const MAX_USER_REVIEWS_PER_HOUR = 10;

type Submission = typeof deliverableSubmission.$inferSelect;

function reviewResult(row: Submission) {
  return row.reviewResult as
    (DeliverableReviewContent & { model: string; reviewedAt: string }) | null;
}

function submissionDto(row: Submission) {
  return {
    id: row.id,
    version: row.version,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    submittedBy: { id: row.submittedByActorId, name: row.submittedByActorName },
    submittedAt: row.submittedAt.toISOString(),
    reviewStatus: row.reviewStatus as 'not_requested' | 'pending' | 'completed' | 'failed',
    reviewAttemptCount: row.reviewAttemptCount,
    reviewResult: reviewResult(row),
    reviewError: row.reviewError,
    decision: row.decision as 'ACCEPT' | 'REQUEST_REVISION' | null,
    decisionComment: row.decisionComment,
    decidedBy:
      row.decidedByActorId && row.decidedByActorName
        ? { id: row.decidedByActorId, name: row.decidedByActorName }
        : null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    fileUrl: `/deliverable-submissions/${row.id}/file`,
  };
}

async function actorName(userId: string, executor: DbExecutor = db): Promise<string> {
  const [row] = await executor
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId));
  return row?.name || row?.email || userId;
}

async function issueContext(issueId: number, executor: DbExecutor = db) {
  const [row] = await executor
    .select({
      id: issue.id,
      projectId: issue.projectId,
      title: issue.title,
      description: issue.description,
      assigneeUserId: issue.assigneeUserId,
    })
    .from(issue)
    .where(eq(issue.id, issueId));
  if (!row) throw new HttpError(404, 'Issue not found');
  return row;
}

async function assertSubmitter(projectId: number, assigneeUserId: string | null, userId: string) {
  const access = await getProjectAccess(projectId, userId);
  if (!access) throw new HttpError(403, 'You do not have access to this project');
  if (!canActOnDeliverable(access.role, assigneeUserId, userId)) {
    throw new HttpError(403, 'Only the assignee or project owner can submit and request AI review');
  }
  return access.role === 'owner';
}

async function rowsForIssue(issueId: number): Promise<Submission[]> {
  return db
    .select()
    .from(deliverableSubmission)
    .where(eq(deliverableSubmission.issueId, issueId))
    .orderBy(desc(deliverableSubmission.version));
}

export async function listProjectDeliverables(projectId: number) {
  const rows = await db
    .select({
      submission: deliverableSubmission,
      issueId: issue.id,
      issueSequence: issue.sequenceNumber,
      issueTitle: issue.title,
      projectKey: project.key,
    })
    .from(deliverableSubmission)
    .innerJoin(issue, eq(issue.id, deliverableSubmission.issueId))
    .innerJoin(project, eq(project.id, deliverableSubmission.projectId))
    .where(eq(deliverableSubmission.projectId, projectId))
    .orderBy(desc(deliverableSubmission.submittedAt));
  return rows.map((row) => ({
    issue: {
      id: row.issueId,
      identifier: `${row.projectKey}-${row.issueSequence}`,
      sequenceNumber: row.issueSequence,
      title: row.issueTitle,
    },
    submission: submissionDto(row.submission),
  }));
}

export async function getDeliverableProjectId(submissionId: number): Promise<number | null> {
  const [row] = await db
    .select({ projectId: deliverableSubmission.projectId })
    .from(deliverableSubmission)
    .where(eq(deliverableSubmission.id, submissionId));
  return row?.projectId ?? null;
}

export async function getDeliverableState(issueId: number, current: AuthUser) {
  const context = await issueContext(issueId);
  const access = await getProjectAccess(context.projectId, current.id);
  const canAct = canActOnDeliverable(access?.role, context.assigneeUserId, current.id);
  const rows = await rowsForIssue(issueId);
  const latest = rows[0];
  return {
    status: deliverableStatus(latest),
    canSubmit: canAct && canSubmitDeliverable(latest),
    canReview: canAct && canReviewDeliverable(latest),
    canDecide: canDecideDeliverable(access?.role, latest),
    submissions: rows.map(submissionDto),
  };
}

export async function createSubmission(issueId: number, file: File, current: AuthUser) {
  const context = await issueContext(issueId);
  await assertSubmitter(context.projectId, context.assigneeUserId, current.id);
  if (file.size === 0 || file.size > MAX_FILE_BYTES) {
    throw new HttpError(413, 'Deliverable must be between 1 byte and 10 MB');
  }
  const filename = safeAttachmentFilename(file.name);
  const contentType = deliverableContentType(filename);
  if (!contentType) throw new HttpError(400, 'Only PDF and DOCX deliverables are accepted');
  const bytes = Buffer.from(await file.arrayBuffer());
  await extractDocument(filename, bytes, {
    maxFileBytes: MAX_FILE_BYTES,
    maxSourceChars: MAX_SOURCE_CHARS,
  });
  await assertAttachmentStorageCapacity(context.projectId, bytes.length);
  const key = attachmentObjectKey(context.projectId, 'deliverables', issueId, filename);
  await storeAttachmentObject(key, bytes, contentType);

  try {
    const row = await db.transaction(async (tx) => {
      await lockAttachmentStorage(tx, context.projectId);
      await assertAttachmentStorageCapacity(context.projectId, bytes.length, 0, tx);
      await tx.execute(sql`select pg_advisory_xact_lock(${issueId}, 7202606)`);
      const [latest] = await tx
        .select()
        .from(deliverableSubmission)
        .where(eq(deliverableSubmission.issueId, issueId))
        .orderBy(desc(deliverableSubmission.version))
        .limit(1);
      if (latest && !canSubmitDeliverable(latest)) {
        throw new HttpError(409, 'The current submission must be sent back for revision first');
      }
      const name = await actorName(current.id, tx);
      const [created] = await tx
        .insert(deliverableSubmission)
        .values({
          projectId: context.projectId,
          issueId,
          version: (latest?.version ?? 0) + 1,
          s3Key: key,
          filename,
          contentType,
          sizeBytes: bytes.length,
          submittedByUserId: current.id,
          submittedByActorId: current.id,
          submittedByActorName: name,
        })
        .returning();
      return created!;
    });
    return submissionDto(row);
  } catch (error) {
    await deleteAttachmentObject(key);
    throw error;
  }
}

export async function getSubmissionFile(submissionId: number) {
  const [row] = await db
    .select()
    .from(deliverableSubmission)
    .where(eq(deliverableSubmission.id, submissionId));
  if (!row) throw new HttpError(404, 'Deliverable submission not found');
  return row;
}

async function claimReview(submissionId: number, current: AuthUser): Promise<Submission> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7202606)`);
    const [row] = await tx
      .select()
      .from(deliverableSubmission)
      .where(eq(deliverableSubmission.id, submissionId))
      .limit(1);
    if (!row) throw new HttpError(404, 'Deliverable submission not found');
    const context = await issueContext(row.issueId, tx);
    await assertSubmitter(row.projectId, context.assigneeUserId, current.id);
    const [latest] = await tx
      .select({ id: deliverableSubmission.id })
      .from(deliverableSubmission)
      .where(eq(deliverableSubmission.issueId, row.issueId))
      .orderBy(desc(deliverableSubmission.version))
      .limit(1);
    if (latest?.id !== row.id)
      throw new HttpError(409, 'Only the current submission can be reviewed');
    if (row.decision) throw new HttpError(409, 'This submission already has a final decision');
    if (row.reviewStatus === 'completed') return row;
    const staleBefore = new Date(Date.now() - STALE_REVIEW_MS);
    if (
      row.reviewStatus === 'pending' &&
      row.reviewStartedAt &&
      row.reviewStartedAt > staleBefore
    ) {
      throw new HttpError(409, 'AI review is already running');
    }
    if (row.reviewAttemptCount >= MAX_REVIEW_ATTEMPTS) {
      throw new HttpError(429, 'This submission has reached the AI review attempt limit');
    }
    const hourAgo = new Date(Date.now() - 60 * 60_000);
    const [[concurrent], [recent]] = await Promise.all([
      tx
        .select({ value: count() })
        .from(deliverableSubmission)
        .where(
          and(
            eq(deliverableSubmission.reviewStatus, 'pending'),
            gt(deliverableSubmission.reviewStartedAt, staleBefore),
          ),
        ),
      tx
        .select({ value: count() })
        .from(deliverableSubmission)
        .where(
          and(
            eq(deliverableSubmission.reviewRequestedByUserId, current.id),
            gt(deliverableSubmission.reviewStartedAt, hourAgo),
          ),
        ),
    ]);
    if ((concurrent?.value ?? 0) >= MAX_CONCURRENT_REVIEWS) {
      throw new HttpError(429, 'Built-in AI is busy; try again later');
    }
    if ((recent?.value ?? 0) >= MAX_USER_REVIEWS_PER_HOUR) {
      throw new HttpError(429, 'AI review hourly limit reached');
    }
    const [claimed] = await tx
      .update(deliverableSubmission)
      .set({
        reviewStatus: 'pending',
        reviewAttemptCount: row.reviewAttemptCount + 1,
        reviewRequestedByUserId: current.id,
        reviewStartedAt: new Date(),
        reviewError: null,
      })
      .where(eq(deliverableSubmission.id, row.id))
      .returning();
    return claimed!;
  });
}

export async function reviewSubmission(submissionId: number, current: AuthUser) {
  const row = await claimReview(submissionId, current);
  if (row.reviewStatus === 'completed') return submissionDto(row);
  try {
    const context = await issueContext(row.issueId);
    const object = await getObject(row.s3Key);
    const bytes = Buffer.from(await new Response(object.body).arrayBuffer());
    const documentText = await extractDocument(row.filename, bytes, {
      maxFileBytes: MAX_FILE_BYTES,
      maxSourceChars: MAX_SOURCE_CHARS,
    });
    const result = await generateDeliverableReview({
      issueTitle: context.title,
      issueDescription: context.description,
      filename: row.filename,
      documentText,
      projectId: row.projectId,
      issueId: row.issueId,
      userId: current.id,
    });
    const [completed] = await db
      .update(deliverableSubmission)
      .set({
        reviewStatus: 'completed',
        reviewResult: result,
        reviewModel: result.model,
        reviewedAt: new Date(result.reviewedAt),
        reviewError: null,
      })
      .where(
        and(
          eq(deliverableSubmission.id, row.id),
          eq(deliverableSubmission.reviewStatus, 'pending'),
          eq(deliverableSubmission.reviewAttemptCount, row.reviewAttemptCount),
          isNull(deliverableSubmission.decision),
        ),
      )
      .returning();
    if (!completed) throw new HttpError(409, 'Submission changed while AI review was running');
    return submissionDto(completed);
  } catch (error) {
    console.error('[deliverables] AI review failed', {
      projectId: row.projectId,
      issueId: row.issueId,
      submissionId: row.id,
      attempt: row.reviewAttemptCount,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    await db
      .update(deliverableSubmission)
      .set({ reviewStatus: 'failed', reviewError: 'AI review could not be completed' })
      .where(
        and(
          eq(deliverableSubmission.id, row.id),
          eq(deliverableSubmission.reviewStatus, 'pending'),
          eq(deliverableSubmission.reviewAttemptCount, row.reviewAttemptCount),
        ),
      );
    throw error;
  }
}

export async function decideSubmission(
  submissionId: number,
  input: { decision: 'ACCEPT' | 'REQUEST_REVISION'; comment?: string },
  current: AuthUser,
) {
  const [row] = await db
    .select()
    .from(deliverableSubmission)
    .where(eq(deliverableSubmission.id, submissionId));
  if (!row) throw new HttpError(404, 'Deliverable submission not found');
  await assertProjectOwner(row.projectId, current);
  if (row.reviewStatus !== 'completed') throw new HttpError(409, 'Complete AI review first');
  if (row.decision) throw new HttpError(409, 'This submission already has a final decision');
  const comment = input.comment?.trim() || null;
  const name = await actorName(current.id);
  const [updated] = await db
    .update(deliverableSubmission)
    .set({
      decision: input.decision,
      decisionComment: comment,
      decidedByUserId: current.id,
      decidedByActorId: current.id,
      decidedByActorName: name,
      decidedAt: new Date(),
    })
    .where(and(eq(deliverableSubmission.id, row.id), isNull(deliverableSubmission.decision)))
    .returning();
  if (!updated) throw new HttpError(409, 'This submission already has a final decision');
  return submissionDto(updated);
}
