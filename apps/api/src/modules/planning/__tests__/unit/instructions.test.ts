import { describe, expect, it } from 'bun:test';
import { buildPlanningPrompt, PLANNING_INSTRUCTIONS } from '../../instructions';
import type { Plan } from '../../validation';

const plan = (title: string, brief: string, objectives: string[]): Plan => ({
  title,
  brief,
  objectives,
  deadline: null,
  assumptions: [],
  questions: [],
  tasks: [],
});

describe('planning generation language context', () => {
  it('keeps Vietnamese project language signals in the model prompt', () => {
    const draft = plan(
      'Website đặt lịch cắt tóc',
      'Xây dựng website đặt lịch cắt tóc cho khách hàng Việt Nam.',
      ['Phân tích yêu cầu và xây dựng công việc chính cùng công việc con.'],
    );
    expect(JSON.parse(buildPlanningPrompt(draft, [])).draft).toEqual(draft);
    expect(PLANNING_INSTRUCTIONS).toContain('predominant language used in draft.brief');
    expect(PLANNING_INSTRUCTIONS).toContain('sourceAssessments explanations');
  });

  it('keeps English projects supported without a hardcoded output language', () => {
    const draft = plan('Booking website', 'Build a haircut appointment website.', [
      'Break the project into actionable work packages.',
    ]);
    expect(JSON.parse(buildPlanningPrompt(draft, [])).draft).toEqual(draft);
    expect(PLANNING_INSTRUCTIONS).not.toContain('Always write in Vietnamese');
  });
});
