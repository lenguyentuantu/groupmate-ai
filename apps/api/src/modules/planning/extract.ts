import mammoth from 'mammoth';
import { inflateRawSync } from 'node:zlib';
import { pdfToMarkdown } from '#modules/chat-attachments/pdf';
import { HttpError } from '#shared/lib';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SOURCE_CHARS = 60000;

function checkDocx(bytes: Buffer) {
  let entries = 0,
    expanded = 0;
  for (let offset = 0; offset + 46 <= bytes.length; offset++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) continue;
    if (bytes.readUInt16LE(offset + 8) & 1)
      throw new HttpError(400, 'Encrypted documents are not supported');
    expanded += bytes.readUInt32LE(offset + 24);
    if (++entries > 1000 || expanded > 10 * 1024 * 1024)
      throw new HttpError(400, 'DOCX expanded content exceeds the safe limit');
    const local = bytes.readUInt32LE(offset + 42),
      compressed = bytes.readUInt32LE(offset + 20);
    if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50)
      throw new HttpError(400, 'Unreadable DOCX archive');
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (start + compressed > bytes.length) throw new HttpError(400, 'Truncated DOCX archive');
    const method = bytes.readUInt16LE(offset + 10);
    let raw: Buffer;
    try {
      if (method !== 0 && method !== 8) throw new Error('Unsupported compression');
      raw =
        method === 0
          ? bytes.subarray(start, start + compressed)
          : inflateRawSync(bytes.subarray(start, start + compressed), {
              maxOutputLength: 10 * 1024 * 1024,
            });
    } catch {
      throw new HttpError(400, 'Unreadable DOCX or excessive decompressed content');
    }
    if (raw.length !== bytes.readUInt32LE(offset + 24))
      throw new HttpError(400, 'Invalid DOCX expanded size');
    const name = bytes
      .subarray(offset + 46, offset + 46 + bytes.readUInt16LE(offset + 28))
      .toString();
    if (/\.xml$/i.test(name) && /<!DOCTYPE|<!ENTITY/i.test(raw.toString()))
      throw new HttpError(400, 'Unsupported XML declarations in DOCX');
    offset +=
      45 +
      bytes.readUInt16LE(offset + 28) +
      bytes.readUInt16LE(offset + 30) +
      bytes.readUInt16LE(offset + 32);
  }
  if (!entries) throw new HttpError(400, 'Unreadable or encrypted DOCX');
}

export async function extractDocument(filename: string, bytes: Buffer): Promise<string> {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES)
    throw new HttpError(400, 'Document must be between 1 byte and 5 MB');
  let text: string;
  if (/\.pdf$/i.test(filename)) {
    if (!bytes.subarray(0, 8).toString().startsWith('%PDF-'))
      throw new HttpError(400, 'Unreadable PDF');
    if (/\/Encrypt\b/.test(bytes.toString('latin1')))
      throw new HttpError(400, 'Encrypted PDFs are not supported');
    text = await pdfToMarkdown(bytes);
  } else if (/\.docx$/i.test(filename)) {
    checkDocx(bytes);
    try {
      text = (await mammoth.extractRawText({ buffer: bytes })).value;
    } catch {
      throw new HttpError(400, 'Unreadable or unsupported DOCX');
    }
  } else throw new HttpError(400, 'Only text-based PDF and DOCX documents are supported');
  text = text.replace(/\r\n/g, '\n').trim();
  if (!text) throw new HttpError(400, 'Document has no readable text');
  if (text.length > MAX_SOURCE_CHARS)
    throw new HttpError(400, 'Extracted text exceeds 60,000 characters; split the document');
  return text;
}
