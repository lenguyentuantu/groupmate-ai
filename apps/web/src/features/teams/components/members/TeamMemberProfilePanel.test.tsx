import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { JSDOM } from 'jsdom';
import type { MemberProfile, MemberProfileInput } from '@/lib/api/endpoints/teams';
import teams from '../../../../../messages/en/teams.json';

const globals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'Event',
  'MouseEvent',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;
let originals: Map<string, PropertyDescriptor | undefined>;
let dom: JSDOM;
let root: Root;
let client: QueryClient;
let profile: MemberProfile;
let requests: { method: string; body?: MemberProfileInput }[];
let failRead: boolean;
let failSave: boolean;
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  originals = new Map(
    globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://web.test/' });
  for (const name of globals) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: name === 'IS_REACT_ACT_ENVIRONMENT' || dom.window[name as keyof typeof dom.window],
    });
  }
  window.__ITSAPLAN_ENV__ = { apiUrl: 'http://api.test', privacyUrl: '', termsUrl: '' };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  profile = {
    skills: [],
    weeklyAvailabilityMinutes: null,
    preferences: '',
    canEdit: true,
    workload: { activeTasks: 0, knownEstimateMinutes: 0, unknownEstimateTasks: 0 },
  };
  requests = [];
  failRead = false;
  failSave = false;
  // HTTP fixtures exercise the UI/client contract; database behavior is covered by the API suite.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.ok(String(input).endsWith('/teams/7/members/member/profile'));
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as MemberProfileInput) : undefined;
    requests.push({ method, body });
    if (method === 'PUT') {
      if (failSave) return Response.json({ error: 'Cannot save profile' }, { status: 403 });
      profile = { ...profile, ...body };
      return new Response(null, { status: 204 });
    }
    if (failRead) return Response.json({ error: 'Cannot read profile' }, { status: 500 });
    return Response.json(profile);
  }) as typeof fetch;
  const { createRoot } = await import('react-dom/client');
  root = createRoot(document.querySelector('#root')!);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  globalThis.fetch = originalFetch;
  dom.window.close();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function render() {
  const { default: Panel } = await import('./TeamMemberProfilePanel');
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={{ teams }} timeZone="UTC">
          <Panel teamId={7} userId="member" />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    ),
  );
  await settle();
}

async function click(text: string) {
  const button = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === text,
  );
  assert.notEqual(button, undefined);
  await act(async () => button!.click());
  await settle();
}

async function fill(selector: string, value: string) {
  const input = document.querySelector(selector) as HTMLInputElement;
  assert.notEqual(input, null);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

describe('TeamMemberProfilePanel', () => {
  it('saves zero and unknown availability and refetches the saved profile', async () => {
    await render();
    await fill('input[type="number"]', '0');
    await click(teams.profile.save);
    assert.equal(
      requests.find((request) => request.method === 'PUT')?.body?.weeklyAvailabilityMinutes,
      0,
    );
    assert.ok(requests.filter((request) => request.method === 'GET').length > 1);
    assert.ok(document.body.textContent?.includes(teams.profile.capacityZero));
    await fill('input[type="number"]', '');
    await click(teams.profile.save);
    assert.equal(profile.weeklyAvailabilityMinutes, null);
    assert.ok(document.body.textContent?.includes(teams.profile.capacityUnknown));
  });

  it('adds, edits and removes skills through the real client request shape', async () => {
    await render();
    await click(teams.profile.addSkill);
    await fill('input[aria-label="Skill 1"]', 'TypeScript');
    await act(async () => {
      const select = document.querySelector('select')!;
      select.value = '4';
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await click(teams.profile.save);
    assert.deepEqual(profile.skills, [{ name: 'TypeScript', proficiency: 4 }]);
    await click(teams.profile.remove);
    await click(teams.profile.save);
    assert.deepEqual(profile.skills, []);
  });

  it('keeps the entered values after a failed save', async () => {
    await render();
    failSave = true;
    await fill('input[type="number"]', '8');
    await click(teams.profile.save);
    assert.equal((document.querySelector('input[type="number"]') as HTMLInputElement).value, '8');
    assert.equal(profile.weeklyAvailabilityMinutes, null);
    assert.equal(document.querySelector('fieldset')?.disabled, false);
  });

  it('shows read-only values without editable controls for a peer', async () => {
    profile.canEdit = false;
    profile.skills = [{ name: 'Design', proficiency: 3 }];
    profile.weeklyAvailabilityMinutes = 0;
    await render();
    assert.equal(document.querySelector('form'), null);
    assert.ok(document.body.textContent?.includes('Design'));
    assert.ok(document.body.textContent?.includes('0 hours per week'));
  });

  it('shows a recoverable read error', async () => {
    failRead = true;
    await render();
    assert.ok(
      document.querySelector('[role="alert"]')?.textContent?.includes(teams.profile.loadFailed),
    );
    failRead = false;
    await click(teams.profile.retry);
    assert.notEqual(document.querySelector('form'), null);
  });
});
