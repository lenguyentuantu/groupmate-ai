import { describe, expect, it } from 'bun:test';
import {
  normalizeGeneratedSourceRefs,
  validateGeneratedPlan,
  validatePlan,
  type Plan,
  type PlanSource,
} from '../../validation';

export const emptyPlan: Plan = {
  title: 'Website',
  brief: 'Build a website',
  objectives: [],
  deadline: null,
  assumptions: [],
  questions: [],
  tasks: [],
};
const taskFields = (id = 'a') => ({
  id,
  title: 'Design',
  description: '',
  deliverable: '',
  acceptanceCriteria: [],
  priority: 'medium' as const,
  requiredSkills: [] as string[],
  estimateMinutes: null,
  dependencyIds: [] as string[],
  sourceRefs: ['brief'],
});
const task = (id = 'a'): Plan['tasks'][number] => ({ ...taskFields(id), parentId: null });
const generatedLeafTask = (id = 'a') => taskFields(id);
const generatedTask = (id = 'a') => ({ ...taskFields(id), subtasks: [] });
const source = (attachmentId: string, texts: string[]): PlanSource => ({
  attachmentId,
  filename: `${attachmentId}.pdf`,
  blocks: texts.map((text, index) => ({ ref: `${attachmentId}:block-${index + 1}`, text })),
});
describe('WBS validation', () => {
  it('preserves unknown estimates and permits fifty tasks', () => {
    const plan = validatePlan(
      { ...emptyPlan, tasks: Array.from({ length: 50 }, (_, i) => task(`t${i}`)) },
      [],
    );
    expect(plan.tasks).toHaveLength(50);
    expect(plan.tasks[0].estimateMinutes).toBeNull();
  });
  const invalid: [string, unknown][] = [
    ['51 tasks', Array.from({ length: 51 }, (_, i) => task(`t${i}`))],
    ['duplicate IDs', [task(), task()]],
    ['orphan parent', [{ ...task(), parentId: 'missing' }]],
    ['self parent', [{ ...task(), parentId: 'a' }]],
    ['nested subtasks', [task(), { ...task('b'), parentId: 'a' }, { ...task('c'), parentId: 'b' }]],
    ['missing dependency', [{ ...task(), dependencyIds: ['missing'] }]],
    ['self dependency', [{ ...task(), dependencyIds: ['a'] }]],
    [
      'cycle',
      [
        { ...task(), dependencyIds: ['b'] },
        { ...task('b'), dependencyIds: ['a'] },
      ],
    ],
    ['parent cycle', [task(), { ...task('b'), parentId: 'a', dependencyIds: ['a'] }]],
    ['duplicate dependencies', [task(), { ...task('b'), dependencyIds: ['a', 'a'] }]],
    ['invented source', [{ ...task(), sourceRefs: ['imaginary:page-1'] }]],
    ['zero estimate', [{ ...task(), estimateMinutes: 0 }]],
    ['negative estimate', [{ ...task(), estimateMinutes: -1 }]],
    ['fraction estimate', [{ ...task(), estimateMinutes: 1.5 }]],
    ['blank title', [{ ...task(), title: '  ' }]],
    ['unexpected assignment', [{ ...task(), assigneeUserId: 'user' }]],
  ];
  for (const [name, tasks] of invalid)
    it(`rejects ${name}`, () => expect(() => validatePlan({ ...emptyPlan, tasks }, [])).toThrow());
  it('accepts a DAG, subtask and genuine source reference', () => {
    const value = {
      ...emptyPlan,
      tasks: [
        task(),
        { ...task('b'), parentId: 'a', sourceRefs: ['file:block-1'] },
        { ...task('c'), dependencyIds: ['a'], estimateMinutes: 30 },
      ],
    };
    expect(
      validatePlan(value, [
        {
          attachmentId: 'file',
          filename: 'brief.docx',
          blocks: [{ ref: 'file:block-1', text: 'Design' }],
        },
      ]),
    ).toEqual(value);
  });
  it('normalizes the generated draft alias while preserving exact block references', () => {
    const sourceRefs = ['file:block-1', 'draft'];
    const value = { ...emptyPlan, tasks: [{ ...generatedTask(), sourceRefs }] };
    expect(normalizeGeneratedSourceRefs(value, true)).toEqual({
      ...value,
      tasks: [{ ...generatedTask(), sourceRefs: ['file:block-1', 'brief'] }],
    });
  });
  it('keeps a supported brief-only reference unchanged', () => {
    const sourceRefs = ['brief'];
    const value = { ...emptyPlan, tasks: [{ ...generatedTask(), sourceRefs }] };
    expect(normalizeGeneratedSourceRefs(value, true)).toEqual(value);
  });
  it('keeps valid block references unchanged', () => {
    const sourceRefs = ['file:block-1'];
    const value = { ...emptyPlan, tasks: [{ ...generatedTask(), sourceRefs }] };
    expect(normalizeGeneratedSourceRefs(value, true)).toEqual(value);
  });
  it('removes only the draft alias when the original brief is empty', () => {
    const value = {
      ...emptyPlan,
      brief: '',
      tasks: [{ ...generatedTask(), sourceRefs: ['file:block-1', 'draft'] }],
    };
    expect(normalizeGeneratedSourceRefs(value, false)).toEqual({
      ...value,
      tasks: [{ ...generatedTask(), sourceRefs: ['file:block-1'] }],
    });
  });
  it('does not normalize fabricated source references', () => {
    const value = {
      ...emptyPlan,
      tasks: [{ ...generatedTask(), sourceRefs: ['file:block-1', 'fabricated:block-9'] }],
    };
    expect(normalizeGeneratedSourceRefs(value, true)).toEqual(value);
    expect(() => validateGeneratedPlan({ ...value, sourceAssessments: [] }, emptyPlan, [])).toThrow(
      'Unknown source reference',
    );
  });
  it('rejects invalid dates and blank brief citations', () => {
    expect(() => validatePlan({ ...emptyPlan, deadline: '2026-02-30' }, [])).toThrow();
    expect(() => validatePlan({ ...emptyPlan, brief: '', tasks: [task()] }, [])).toThrow();
  });
  it('accepts project requirements with exact supporting blocks', () => {
    const specification = source('spec', ['The website requires login and a Kanban board.']);
    const result = validateGeneratedPlan(
      {
        ...emptyPlan,
        tasks: [{ ...generatedTask(), sourceRefs: ['spec:block-1'] }],
        sourceAssessments: [
          {
            attachmentId: 'spec',
            classification: 'requirements',
            explanation: 'Defines deliverables that match the project brief.',
            relevantBlockRefs: ['spec:block-1'],
          },
        ],
      },
      emptyPlan,
      [specification],
    );
    expect(result.sourceAssessments[0].classification).toBe('requirements');
    expect(result.content.tasks[0].sourceRefs).toEqual(['spec:block-1']);
  });
  it('accepts general methodology only as reference material', () => {
    const guide = source('guide', ['Use change reviews to monitor delivery quality.']);
    const result = validateGeneratedPlan(
      {
        ...emptyPlan,
        tasks: [
          {
            ...generatedTask(),
            acceptanceCriteria: ['Changes are reviewed'],
            sourceRefs: ['brief', 'guide:block-1'],
          },
        ],
        sourceAssessments: [
          {
            attachmentId: 'guide',
            classification: 'reference_only',
            explanation: 'Provides delivery guidance without adding product scope.',
            relevantBlockRefs: ['guide:block-1'],
          },
        ],
      },
      emptyPlan,
      [guide],
    );
    expect(result.sourceAssessments[0].classification).toBe('reference_only');
  });
  it('accepts an irrelevant document only when it supplies no WBS evidence', () => {
    const exam = source('exam', ['Answer all university project management questions.']);
    const result = validateGeneratedPlan(
      {
        ...emptyPlan,
        tasks: [generatedTask()],
        sourceAssessments: [
          {
            attachmentId: 'exam',
            classification: 'irrelevant',
            explanation: 'This is an academic exam, not a project requirement.',
            relevantBlockRefs: [],
          },
        ],
      },
      emptyPlan,
      [exam],
    );
    expect(result.content.tasks[0].sourceRefs).toEqual(['brief']);
  });
  it('keeps only relevant evidence from a mixed-content document', () => {
    const mixed = source('mixed', [
      'Use a review checklist for delivery quality.',
      'Complete the unrelated course examination.',
    ]);
    const result = validateGeneratedPlan(
      {
        ...emptyPlan,
        tasks: [{ ...generatedTask(), sourceRefs: ['brief', 'mixed:block-1'] }],
        sourceAssessments: [
          {
            attachmentId: 'mixed',
            classification: 'reference_only',
            explanation: 'Only the delivery checklist is relevant background.',
            relevantBlockRefs: ['mixed:block-1'],
          },
        ],
      },
      emptyPlan,
      [mixed],
    );
    expect(result.sourceAssessments[0].relevantBlockRefs).toEqual(['mixed:block-1']);
  });
  it('keeps the saved Planning schema compatible when no documents are uploaded', () => {
    expect(validatePlan(emptyPlan, [])).toEqual(emptyPlan);
    expect(
      validateGeneratedPlan({ ...emptyPlan, tasks: [], sourceAssessments: [] }, emptyPlan, []),
    ).toEqual({ content: emptyPlan, sourceAssessments: [] });
  });
  it('preserves user-authored project fields while accepting nested generated content', () => {
    const original = {
      ...emptyPlan,
      title: 'Website đặt lịch cắt tóc',
      brief: 'Xây dựng website đặt lịch cắt tóc cho khách hàng Việt Nam.',
      objectives: ['Xây dựng WBS gồm công việc chính và công việc con.'],
      deadline: '2027-12-31',
    };
    const result = validateGeneratedPlan(
      {
        ...original,
        title: 'Haircut booking website',
        brief: 'Build an appointment website.',
        objectives: ['Create an English work breakdown structure.'],
        deadline: '2030-01-01',
        tasks: [
          {
            ...generatedTask('booking'),
            subtasks: [generatedLeafTask('choose-slot'), generatedLeafTask('confirm-booking')],
          },
        ],
        sourceAssessments: [],
      },
      original,
      [],
    );
    expect({
      title: result.content.title,
      brief: result.content.brief,
      objectives: result.content.objectives,
      deadline: result.content.deadline,
    }).toEqual({
      title: original.title,
      brief: original.brief,
      objectives: original.objectives,
      deadline: original.deadline,
    });
  });
  it('rejects fabricated assessment references and unassessed task evidence', () => {
    const specification = source('spec', [
      'The website requires login.',
      'The website requires a Kanban board.',
    ]);
    const assessment = {
      attachmentId: 'spec',
      classification: 'requirements' as const,
      explanation: 'Matches the project brief.',
      relevantBlockRefs: ['spec:block-1'],
    };
    expect(() =>
      validateGeneratedPlan(
        {
          ...emptyPlan,
          sourceAssessments: [{ ...assessment, relevantBlockRefs: ['spec:block-99'] }],
        },
        emptyPlan,
        [specification],
      ),
    ).toThrow('Unknown source reference');
    expect(() =>
      validateGeneratedPlan(
        {
          ...emptyPlan,
          tasks: [{ ...generatedTask(), sourceRefs: ['spec:block-2'] }],
          sourceAssessments: [assessment],
        },
        emptyPlan,
        [specification],
      ),
    ).toThrow('not supported by relevance assessment');
  });
  it('flattens a requested two-level WBS and preserves actionable child fields', () => {
    const original = {
      ...emptyPlan,
      brief:
        'Build a project management website and break down authentication, projects, tasks and Kanban into parent tasks and subtasks.',
    };
    const authentication = {
      ...generatedTask('authentication'),
      title: 'Authentication',
      estimateMinutes: null,
      subtasks: [
        {
          ...generatedLeafTask('login'),
          title: 'Implement login',
          deliverable: 'Working login flow',
          acceptanceCriteria: ['Valid users can sign in'],
          requiredSkills: ['Backend', 'Security'],
          estimateMinutes: 120,
        },
        {
          ...generatedLeafTask('sessions'),
          title: 'Implement sessions',
          deliverable: 'Persistent authenticated sessions',
          acceptanceCriteria: ['Sessions expire safely'],
          requiredSkills: ['Backend'],
          estimateMinutes: 180,
          dependencyIds: ['login'],
        },
      ],
    };
    const documentation = {
      ...generatedTask('documentation'),
      title: 'Write operator guide',
      estimateMinutes: 30,
    };
    const result = validateGeneratedPlan(
      { ...original, tasks: [authentication, documentation], sourceAssessments: [] },
      original,
      [],
    );
    expect(result.content.tasks.map(({ id, parentId }) => ({ id, parentId }))).toEqual([
      { id: 'authentication', parentId: null },
      { id: 'login', parentId: 'authentication' },
      { id: 'sessions', parentId: 'authentication' },
      { id: 'documentation', parentId: null },
    ]);
    const sessions = result.content.tasks.find(({ id }) => id === 'sessions')!;
    expect(sessions.requiredSkills).toEqual(['Backend']);
    expect(sessions.dependencyIds).toEqual(['login']);
    expect(sessions.estimateMinutes).toBe(180);
    const parentIds = new Set(result.content.tasks.map((item) => item.parentId).filter(Boolean));
    const totalEffort = result.content.tasks
      .filter((item) => !parentIds.has(item.id))
      .reduce((sum, item) => sum + (item.estimateMinutes ?? 0), 0);
    expect(totalEffort).toBe(330);
  });
  it('clears aggregate root effort while preserving child and standalone estimates', () => {
    const result = validateGeneratedPlan(
      {
        ...emptyPlan,
        tasks: [
          {
            ...generatedTask('parent'),
            estimateMinutes: 480,
            subtasks: [
              { ...generatedLeafTask('first'), estimateMinutes: 180 },
              { ...generatedLeafTask('second'), estimateMinutes: 180 },
              { ...generatedLeafTask('third'), estimateMinutes: 120 },
            ],
          },
          { ...generatedTask('standalone'), estimateMinutes: 60 },
        ],
        sourceAssessments: [],
      },
      emptyPlan,
      [],
    );

    expect(
      result.content.tasks.map(({ id, estimateMinutes }) => ({ id, estimateMinutes })),
    ).toEqual([
      { id: 'parent', estimateMinutes: null },
      { id: 'first', estimateMinutes: 180 },
      { id: 'second', estimateMinutes: 180 },
      { id: 'third', estimateMinutes: 120 },
      { id: 'standalone', estimateMinutes: 60 },
    ]);
  });
  it('rejects flat generation only when the brief explicitly requests decomposition', () => {
    const flatOutput = {
      ...emptyPlan,
      tasks: [generatedTask('login'), generatedTask('projects')],
      sourceAssessments: [],
    };
    expect(validateGeneratedPlan(flatOutput, emptyPlan, []).content.tasks).toHaveLength(2);
    expect(
      validateGeneratedPlan(
        flatOutput,
        { ...emptyPlan, brief: 'Build the website without subtasks.' },
        [],
      ).content.tasks,
    ).toHaveLength(2);
    expect(() =>
      validateGeneratedPlan(
        flatOutput,
        { ...emptyPlan, brief: 'Break down the website into parent tasks and subtasks.' },
        [],
      ),
    ).toThrow('requires at least one decomposed work package');
  });
  it('recognizes the real Vietnamese decomposition objective without forcing negated requests', () => {
    const objective =
      'Phân tích yêu cầu và xây dựng WBS gồm công việc chính và công việc con cho dự án website đặt lịch cắt tóc.';
    const original = {
      ...emptyPlan,
      brief: 'Xây dựng website đặt lịch cắt tóc.',
      objectives: [objective],
    };
    const flatOutput = {
      ...emptyPlan,
      tasks: [generatedTask('booking'), generatedTask('customers')],
      sourceAssessments: [],
    };
    expect(() => validateGeneratedPlan(flatOutput, original, [])).toThrow(
      'requires at least one decomposed work package',
    );
    const nestedOutput = {
      ...flatOutput,
      tasks: [
        {
          ...generatedTask('booking'),
          subtasks: [generatedLeafTask('choose-slot'), generatedLeafTask('confirm-booking')],
        },
      ],
    };
    expect(validateGeneratedPlan(nestedOutput, original, []).content.tasks).toHaveLength(3);
    expect(
      validateGeneratedPlan(
        flatOutput,
        { ...original, objectives: ['Không cần công việc con cho phạm vi đơn giản này.'] },
        [],
      ).content.tasks,
    ).toHaveLength(2);
  });
  it('rejects generation-only grandchildren and parent-child dependency conflicts', () => {
    const child = generatedLeafTask('child');
    expect(() =>
      validateGeneratedPlan(
        {
          ...emptyPlan,
          tasks: [
            {
              ...generatedTask('parent'),
              subtasks: [{ ...child, subtasks: [generatedLeafTask('grandchild')] }],
            },
          ],
          sourceAssessments: [],
        },
        emptyPlan,
        [],
      ),
    ).toThrow();
    expect(() =>
      validateGeneratedPlan(
        {
          ...emptyPlan,
          tasks: [
            {
              ...generatedTask('parent'),
              subtasks: [
                { ...child, dependencyIds: ['parent'] },
                { ...child, id: 'sibling' },
              ],
            },
          ],
          sourceAssessments: [],
        },
        emptyPlan,
        [],
      ),
    ).toThrow('cannot depend on each other');
    expect(
      validateGeneratedPlan(
        {
          ...emptyPlan,
          tasks: [
            {
              ...generatedTask('parent'),
              estimateMinutes: 60,
              subtasks: [child, generatedLeafTask('sibling')],
            },
          ],
          sourceAssessments: [],
        },
        emptyPlan,
        [],
      ).content.tasks[0].estimateMinutes,
    ).toBeNull();
  });
  it('rejects duplicate generated IDs, dependency cycles and more than fifty flattened tasks', () => {
    const output = (tasks: unknown[]) => ({
      ...emptyPlan,
      tasks,
      sourceAssessments: [],
    });
    expect(() =>
      validateGeneratedPlan(
        output([
          {
            ...generatedTask('parent'),
            subtasks: [generatedLeafTask('duplicate'), generatedLeafTask('duplicate')],
          },
        ]),
        emptyPlan,
        [],
      ),
    ).toThrow('Task IDs must be unique');
    expect(() =>
      validateGeneratedPlan(
        output([
          { ...generatedTask('a'), dependencyIds: ['b'] },
          { ...generatedTask('b'), dependencyIds: ['a'] },
        ]),
        emptyPlan,
        [],
      ),
    ).toThrow('Dependency cycle detected');
    expect(() =>
      validateGeneratedPlan(
        output([
          {
            ...generatedTask('parent'),
            subtasks: Array.from({ length: 49 }, (_, index) => ({
              ...generatedLeafTask(`child-${index}`),
            })),
          },
          generatedTask('standalone'),
        ]),
        emptyPlan,
        [],
      ),
    ).toThrow();
  });
});
