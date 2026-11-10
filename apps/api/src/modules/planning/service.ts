import { db, planningDraft, planningDraftRevision } from '@repo/db';
import { and, count, desc, eq } from 'drizzle-orm';
import { HttpError, iso } from '#shared/lib';
import { validatePlan, type PlanSource } from './validation';
import { resolveSources } from './sources';

function dto(row: typeof planningDraft.$inferSelect) {
  return { ...row, status: 'draft' as const, updatedAt: iso(row.updatedAt) };
}
export async function getDraft(projectId: number, id: number) {
  const [row] = await db
    .select()
    .from(planningDraft)
    .where(and(eq(planningDraft.projectId, projectId), eq(planningDraft.id, id)));
  if (!row) throw new HttpError(404, 'Planning draft not found');
  return dto(row);
}
export async function listDrafts(projectId: number, window: { limit: number; offset: number }) {
  const where = eq(planningDraft.projectId, projectId);
  const [items, totals] = await Promise.all([
    db
      .select({
        id: planningDraft.id,
        title: planningDraft.title,
        version: planningDraft.version,
        updatedAt: planningDraft.updatedAt,
      })
      .from(planningDraft)
      .where(where)
      .orderBy(desc(planningDraft.updatedAt), desc(planningDraft.id))
      .limit(window.limit)
      .offset(window.offset),
    db.select({ total: count() }).from(planningDraft).where(where),
  ]);
  return {
    items: items.map((row) => ({ ...row, updatedAt: iso(row.updatedAt) })),
    total: totals[0].total,
  };
}
export async function saveDraft(
  projectId: number,
  actor: string,
  input: { content: unknown; attachmentIds: string[]; version?: number },
  id?: number,
) {
  const existing = id === undefined ? null : await getDraft(projectId, id);
  if (existing && existing.version !== input.version)
    throw new HttpError(409, 'This draft changed. Reopen the latest version before saving.');
  const sources = await resolveSources(
    projectId,
    input.attachmentIds,
    (existing?.sources ?? []) as PlanSource[],
  );
  const content = validatePlan(input.content, sources);
  return db.transaction(async (tx) => {
    const values = { content, sources, title: content.title, updatedAt: new Date() };
    const [row] = existing
      ? await tx
          .update(planningDraft)
          .set({ ...values, version: existing.version + 1 })
          .where(
            and(
              eq(planningDraft.id, existing.id),
              eq(planningDraft.projectId, projectId),
              eq(planningDraft.version, input.version!),
            ),
          )
          .returning()
      : await tx
          .insert(planningDraft)
          .values({ ...values, projectId })
          .returning();
    if (!row)
      throw new HttpError(409, 'This draft changed. Reopen the latest version before saving.');
    await tx
      .insert(planningDraftRevision)
      .values({ draftId: row.id, version: row.version, content, sources, createdByUserId: actor });
    return dto(row);
  });
}
export async function listRevisions(
  projectId: number,
  id: number,
  window: { limit: number; offset: number },
) {
  await getDraft(projectId, id);
  const where = eq(planningDraftRevision.draftId, id);
  const [items, totals] = await Promise.all([
    db
      .select({
        version: planningDraftRevision.version,
        createdByUserId: planningDraftRevision.createdByUserId,
        createdAt: planningDraftRevision.createdAt,
      })
      .from(planningDraftRevision)
      .where(where)
      .orderBy(desc(planningDraftRevision.version))
      .limit(window.limit)
      .offset(window.offset),
    db.select({ total: count() }).from(planningDraftRevision).where(where),
  ]);
  return {
    items: items.map((r) => ({ ...r, createdAt: iso(r.createdAt) })),
    total: totals[0].total,
  };
}
export async function getRevision(projectId: number, id: number, version: number) {
  await getDraft(projectId, id);
  const [row] = await db
    .select()
    .from(planningDraftRevision)
    .where(and(eq(planningDraftRevision.draftId, id), eq(planningDraftRevision.version, version)));
  if (!row) throw new HttpError(404, 'Revision not found');
  return { ...row, createdAt: iso(row.createdAt) };
}
