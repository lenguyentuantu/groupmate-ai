import { db, chatAttachment } from '@repo/db';
import { and, count, desc, eq, or, ilike } from 'drizzle-orm';
import { getObject } from '@repo/storage';
import { HttpError } from '#shared/lib';
import {
  createChatAttachment,
  getChatAttachmentByPublicId,
} from '#modules/chat-attachments/service';
import {
  attachmentObjectKey,
  assertAttachmentUploadAllowed,
  deleteAttachmentObject,
  safeAttachmentFilename,
  storeAttachmentObject,
} from '#modules/attachments/storage';
import { extractDocument, MAX_FILE_BYTES } from './extract';
import type { PlanSource } from './validation';

function sourceOf(id: string, filename: string, text: string): PlanSource {
  return {
    attachmentId: id,
    filename,
    blocks: text
      .split(/\n\s*\n/)
      .filter((t) => t.trim())
      .map((text, i) => ({ ref: `${id}:block-${i + 1}`, text })),
  };
}
export async function uploadSource(
  projectId: number,
  actor: string,
  input: { filename: string; contentBase64: string },
) {
  const filename = safeAttachmentFilename(input.filename);
  const bytes = Buffer.from(input.contentBase64, 'base64');
  if (bytes.length > MAX_FILE_BYTES) throw new HttpError(400, 'Document exceeds 5 MB');
  const contentType = /\.pdf$/i.test(filename)
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  await assertAttachmentUploadAllowed(projectId, bytes.length, contentType);
  const text = await extractDocument(filename, bytes);
  // Keep planning's shared document picker separate from chat uploads.
  const s3Key = attachmentObjectKey(projectId, 'documents', null, filename);
  await storeAttachmentObject(s3Key, bytes, contentType);
  try {
    const row = await createChatAttachment({
      projectId,
      uploadedByUserId: actor,
      s3Key,
      filename,
      contentType,
      sizeBytes: bytes.length,
    });
    return sourceOf(row.publicId, filename, text);
  } catch (error) {
    await deleteAttachmentObject(s3Key);
    throw error;
  }
}
export async function resolveSources(projectId: number, ids: string[], cached: PlanSource[] = []) {
  if (ids.length > 3 || new Set(ids).size !== ids.length)
    throw new HttpError(400, 'Choose up to three distinct documents');
  const sources: PlanSource[] = [];
  for (const id of ids) {
    const row = await getChatAttachmentByPublicId(id);
    if (
      !row ||
      row.projectId !== projectId ||
      !row.s3Key.startsWith(`projects/${projectId}/documents/`)
    )
      throw new HttpError(404, 'Source not found in this project');
    if (row.sizeBytes > MAX_FILE_BYTES) throw new HttpError(400, 'Source exceeds 5 MB');
    const previous = cached.find((s) => s.attachmentId === id);
    if (previous) {
      sources.push(previous);
      continue;
    }
    const object = await getObject(row.s3Key).catch(() => null);
    if (!object) throw new HttpError(404, 'Source file unavailable');
    const reader = new Response(object.body).body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_FILE_BYTES) throw new HttpError(400, 'Source exceeds 5 MB');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    sources.push(
      sourceOf(id, row.filename, await extractDocument(row.filename, Buffer.concat(chunks))),
    );
  }
  if (
    sources.reduce((sum, s) => sum + s.blocks.reduce((n, b) => n + b.text.length, 0), 0) >
    MAX_SOURCE_TOTAL
  )
    throw new HttpError(400, 'Combined sources exceed 80,000 characters');
  return sources;
}
export const MAX_SOURCE_TOTAL = 80000;
export async function listSources(projectId: number, window: { limit: number; offset: number }) {
  const where = and(
    eq(chatAttachment.projectId, projectId),
    ilike(chatAttachment.s3Key, `projects/${projectId}/documents/%`),
    or(ilike(chatAttachment.filename, '%.pdf'), ilike(chatAttachment.filename, '%.docx')),
  );
  const [items, totals] = await Promise.all([
    db
      .select({ attachmentId: chatAttachment.publicId, filename: chatAttachment.filename })
      .from(chatAttachment)
      .where(where)
      .orderBy(desc(chatAttachment.id))
      .limit(window.limit)
      .offset(window.offset),
    db.select({ total: count() }).from(chatAttachment).where(where),
  ]);
  return { items, total: totals[0].total };
}
