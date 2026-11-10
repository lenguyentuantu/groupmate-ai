import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { JSDOM } from 'jsdom';
import type { PlanDraft } from '@/lib/api/endpoints/planning';
import documents from '../../../../messages/en/documents.json';
import common from '../../../../messages/en/common.json';

const globals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLFormElement',
  'HTMLSelectElement',
  'DocumentFragment',
  'MutationObserver',
  'CustomEvent',
  'Event',
  'MouseEvent',
  'Node',
  'Element',
  'getComputedStyle',
  'FileReader',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;
let originals: Map<string, PropertyDescriptor | undefined>,
  dom: JSDOM,
  root: Root,
  client: QueryClient;
let stored: PlanDraft, conflict: boolean, writes: number;
const originalFetch = globalThis.fetch;
beforeEach(async () => {
  originals = new Map(
    globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  dom = new JSDOM('<div id="root"></div>', { url: 'http://web.test/' });
  for (const name of globals)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: name === 'IS_REACT_ACT_ENVIRONMENT' || dom.window[name as keyof typeof dom.window],
    });
  window.__ITSAPLAN_ENV__ = { apiUrl: 'http://api.test', privacyUrl: '', termsUrl: '' };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  stored = {
    id: 1,
    projectId: 1,
    version: 1,
    status: 'draft',
    title: 'Website',
    updatedAt: new Date().toISOString(),
    sources: [],
    content: {
      title: 'Website',
      brief: 'Build website',
      objectives: [],
      deadline: null,
      assumptions: [],
      questions: [],
      tasks: [],
    },
  };
  conflict = false;
  writes = 0;
  // HTTP fixtures cover browser state; API tests cover real PostgreSQL persistence.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'PUT') {
      writes++;
      if (conflict) return Response.json({ error: 'Version conflict' }, { status: 409 });
      const body = JSON.parse(String(init.body));
      assert.equal(body.version, stored.version);
      stored = {
        ...stored,
        content: body.content,
        title: body.content.title,
        version: stored.version + 1,
      };
      return Response.json(stored);
    }
    if (url.includes('/revisions/1'))
      return Response.json({
        version: 1,
        createdAt: stored.updatedAt,
        createdByUserId: 'owner',
        content: { ...stored.content, title: 'Original revision' },
        sources: [],
      });
    return Response.json({
      items: url.includes('/revisions')
        ? [{ version: 1, createdAt: stored.updatedAt, createdByUserId: 'owner' }]
        : [],
      total: url.includes('/revisions') ? 1 : 0,
      page: 1,
      pageSize: 10,
    });
  }) as typeof fetch;
  const { createRoot } = await import('react-dom/client');
  root = createRoot(document.querySelector('#root')!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  globalThis.fetch = originalFetch;
  dom.window.close();
  for (const [name, d] of originals) {
    if (d) Object.defineProperty(globalThis, name, d);
    else Reflect.deleteProperty(globalThis, name);
  }
});
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}
async function render(canEdit = true) {
  const { default: Editor } = await import('./PlanningEditor');
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={{ documents, common }} timeZone="UTC">
          <Editor projectRef="team.PLAN" draft={stored} canEdit={canEdit} onSaved={() => {}} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    ),
  );
  await settle();
}
async function click(text: string) {
  const button = [...document.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text,
  );
  assert.ok(button);
  await act(async () => button.click());
  await settle();
}
async function fill(selector: string, value: string) {
  const input = document.querySelector(selector) as HTMLInputElement;
  assert.ok(input);
  await act(async () => {
    const proto =
      input instanceof dom.window.HTMLTextAreaElement
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
describe('planning editor with HTTP fixtures', () => {
  it('adds, edits and saves a task with unknown effort; removes it in the next revision', async () => {
    await render();
    await click(documents.planning.addTask);
    await fill('details textarea', 'Design');
    await click(documents.planning.save);
    assert.equal(writes, 1);
    assert.equal(stored.content.tasks[0].title, 'Design');
    assert.equal(stored.content.tasks[0].estimateMinutes, null);
    assert.equal(stored.version, 2);
    await click(documents.planning.remove);
    await click(documents.planning.save);
    assert.deepEqual(stored.content.tasks, []);
    assert.equal(stored.version, 3);
  });
  it('retains human edits after a version conflict', async () => {
    await render();
    conflict = true;
    await fill('input', 'My unsaved plan');
    await click(documents.planning.save);
    assert.equal((document.querySelector('input') as HTMLInputElement).value, 'My unsaved plan');
    assert.equal(stored.content.title, 'Website');
    assert.ok(document.querySelector('[role="alert"]')?.textContent?.includes('Version conflict'));
  });
  it('keeps manual editing usable with no provider and disables generation', async () => {
    await render();
    assert.ok(document.body.textContent?.includes(documents.planning.noProvider));
    const generate = [...document.querySelectorAll('button')].find(
      (b) => b.textContent === documents.planning.generate,
    );
    assert.equal(generate?.disabled, true);
    await fill('input', 'Manual plan');
    await click(documents.planning.save);
    assert.equal(stored.content.title, 'Manual plan');
  });
  it('shows read-only drafts and an immutable revision without edit controls', async () => {
    await render(false);
    assert.equal(document.querySelector('form'), null);
    const history = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith('Version 1'),
    );
    assert.ok(history);
    await act(async () => history.click());
    await settle();
    assert.ok(document.body.textContent?.includes('Original revision'));
    assert.equal(writes, 0);
  });
});
