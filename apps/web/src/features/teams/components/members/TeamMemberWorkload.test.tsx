import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import type { MemberProfile } from '@/lib/api/endpoints/teams';
import teams from '../../../../../messages/en/teams.json';
import TeamMemberWorkload from './TeamMemberWorkload';

function render(weeklyAvailabilityMinutes: number | null, unknownEstimateTasks = 0) {
  const profile: MemberProfile = {
    skills: [],
    preferences: '',
    canEdit: false,
    weeklyAvailabilityMinutes,
    workload: { activeTasks: 3, knownEstimateMinutes: 900, unknownEstimateTasks },
  };
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={{ teams }} timeZone="UTC">
      <TeamMemberWorkload profile={profile} />
    </NextIntlClientProvider>,
  );
}

describe('TeamMemberWorkload', () => {
  it('reports unknown availability without inventing capacity', () => {
    assert.ok(render(null).includes(teams.profile.capacityUnknown));
    assert.ok(!render(null).includes(teams.profile.capacityZero));
  });
  it('reports zero availability without dividing by zero', () => {
    const html = render(0);
    assert.ok(html.includes(teams.profile.capacityZero));
    assert.ok(!html.includes('Infinity'));
  });
  it('compares estimates with capacity without claiming a schedule', () => {
    const html = render(600);
    assert.ok(html.includes('1.5 weeks'));
    assert.ok(html.includes('not a delivery schedule'));
    assert.ok(html.includes('Hidden projects'));
  });
  it('warns that unknown estimates understate the workload', () => {
    assert.ok(render(600, 2).includes(teams.profile.estimatesMissing));
    assert.ok(!render(600, 0).includes(teams.profile.estimatesMissing));
  });
});
