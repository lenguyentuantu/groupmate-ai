import { describe, expect, it } from 'bun:test';
import { extractDocument, MAX_FILE_BYTES } from '../../extract';
import { docx, paragraph } from '../fixtures';

describe('planning document extraction', () => {
  it('reads DOCX headings, paragraphs, lists and tables in document order', async () => {
    const bytes = docx(
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Heading</w:t></w:r></w:p>' +
        paragraph('Before table') +
        '<w:tbl><w:tr><w:tc>' +
        paragraph('Cell one') +
        '</w:tc><w:tc>' +
        paragraph('Cell two') +
        '</w:tc></w:tr></w:tbl>' +
        '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>List item</w:t></w:r></w:p>' +
        paragraph('After table'),
    );
    const text = await extractDocument('brief.docx', bytes);
    const terms = ['Heading', 'Before table', 'Cell one', 'Cell two', 'List item', 'After table'];
    expect(terms.map((term) => text.indexOf(term))).toEqual(
      [...terms.map((term) => text.indexOf(term))].sort((a, b) => a - b),
    );
    for (const term of terms) expect(text).toContain(term);
  });
  it('reads the existing text PDF fixture', async () => {
    const bytes = Buffer.from(
      await Bun.file(
        'packages/agent-tools/src/tools/pdf/__tests__/fixtures/text.pdf',
      ).arrayBuffer(),
    );
    expect((await extractDocument('brief.pdf', bytes)).length).toBeGreaterThan(0);
  });
  it('rejects a scanned PDF explicitly', async () => {
    const bytes = Buffer.from(
      await Bun.file(
        'packages/agent-tools/src/tools/pdf/__tests__/fixtures/scanned.pdf',
      ).arrayBuffer(),
    );
    await expect(extractDocument('scan.pdf', bytes)).rejects.toThrow('text layer');
  });
  for (const [name, filename, bytes] of [
    ['empty', 'empty.docx', Buffer.alloc(0)],
    ['oversized', 'big.pdf', Buffer.alloc(MAX_FILE_BYTES + 1)],
    ['encrypted PDF', 'locked.pdf', Buffer.from('%PDF-1.7 /Encrypt 1 0 R')],
    ['malformed PDF', 'broken.pdf', Buffer.from('broken')],
    ['unsupported', 'brief.txt', Buffer.from('text')],
    ['unreadable DOCX', 'bad.docx', Buffer.from('not a zip')],
    ['long extracted text', 'large.docx', docx(paragraph('x'.repeat(60001)))],
    ['zip bomb', 'bomb.docx', docx(paragraph('x'.repeat(11 * 1024 * 1024)))],
    ['XML entities', 'entity.docx', docx('<!DOCTYPE x [<!ENTITY x "test">]>' + paragraph('x'))],
  ] as const)
    it(`rejects ${name}`, async () => {
      await expect(extractDocument(filename, bytes)).rejects.toThrow();
    });
});
