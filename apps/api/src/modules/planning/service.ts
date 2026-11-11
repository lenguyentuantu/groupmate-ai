import {
  aiAgent,
  db,
  issue,
  planningDraft,
  planningDraftRevision,
  planningProposal,
  project,
  projectColumn,
  projectMember,
  teamMember,
  user,
} from '@repo/db';
import { and, count, desc, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { HttpError, iso } from '#shared/lib';
import { getAgentInProject, assertChatEnabled } from '#modules/agents/core/service';
import { resolveModel } from '#modules/agents/core/runtime/index';
import { getMastra } from '#modules/agents/core/runtime/observability';
import { runRefusal } from '#modules/agents/core/run-refusal';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { validatePlan, type PlanSource } from './validation';
import { resolveSources } from './sources';
import {
  buildAssignmentProposal,
  type AssignmentOverrides,
  type PlanningCandidate,
  type PlanningTask,
} from './assignment';

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

type ProvisionalCandidate = Omit<PlanningCandidate, 'isRealMember'>;

function assertProvisionalCandidates(value: unknown): ProvisionalCandidate[] {
  if (!Array.isArray(value)) throw new HttpError(400, 'Planning candidates must be an array');
  const candidates = value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new HttpError(400, 'Invalid provisional planning candidate');
    }
    const item = candidate as Record<string, unknown>;
    if (
      typeof item.id !== 'string' ||
      !item.id.startsWith('provisional:') ||
      typeof item.name !== 'string' ||
      !Array.isArray(item.skills) ||
      (item.weeklyCapacityMinutes !== null && typeof item.weeklyCapacityMinutes !== 'number')
    )
      throw new HttpError(400, 'Invalid provisional planning candidate');
    return {
      id: item.id,
      name: item.name.trim(),
      skills: item.skills.filter((skill): skill is string => typeof skill === 'string'),
      weeklyCapacityMinutes: item.weeklyCapacityMinutes,
      knownWorkloadMinutes:
        typeof item.knownWorkloadMinutes === 'number' ? item.knownWorkloadMinutes : 0,
      unknownWorkloadTasks:
        typeof item.unknownWorkloadTasks === 'number' ? item.unknownWorkloadTasks : 0,
    };
  });
  if (
    candidates.some((candidate) => !candidate.name) ||
    new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length
  )
    throw new HttpError(400, 'Provisional planning candidates must have unique names and IDs');
  return candidates;
}

async function planningCandidates(projectId: number): Promise<PlanningCandidate[]> {
  const [members, workloads] = await Promise.all([
    db
      .select({
        id: projectMember.userId,
        name: user.name,
        skills: teamMember.skills,
        weeklyCapacityMinutes: teamMember.weeklyAvailabilityMinutes,
      })
      .from(projectMember)
      .innerJoin(user, eq(user.id, projectMember.userId))
      .innerJoin(project, eq(project.id, projectMember.projectId))
      .leftJoin(
        teamMember,
        and(eq(teamMember.teamId, project.teamId), eq(teamMember.userId, projectMember.userId)),
      )
      .leftJoin(aiAgent, eq(aiAgent.userId, projectMember.userId))
      .where(and(eq(projectMember.projectId, projectId), isNull(aiAgent.id))),
    db
      .select({
        id: issue.assigneeUserId,
        knownWorkloadMinutes: sql<number>`coalesce(sum(${issue.estimateMinutes}), 0)::int`,
        unknownWorkloadTasks: sql<number>`count(*) filter (where ${issue.estimateMinutes} is null)::int`,
      })
      .from(issue)
      .innerJoin(projectColumn, eq(projectColumn.id, issue.columnId))
      .where(
        and(
          eq(issue.projectId, projectId),
          isNull(issue.archivedAt),
          notInArray(projectColumn.stateType, ['completed', 'canceled']),
        ),
      )
      .groupBy(issue.assigneeUserId),
  ]);
  const workloadById = new Map(
    workloads
      .filter((workload): workload is typeof workload & { id: string } => workload.id !== null)
      .map((workload) => [workload.id, workload]),
  );
  return members.map((member) => {
    const workload = workloadById.get(member.id);
    return {
      id: member.id,
      name: member.name,
      isRealMember: true,
      skills: (member.skills ?? []).map((skill) => skill.name),
      weeklyCapacityMinutes: member.weeklyCapacityMinutes,
      knownWorkloadMinutes: workload?.knownWorkloadMinutes ?? 0,
      unknownWorkloadTasks: workload?.unknownWorkloadTasks ?? 0,
    };
  });
}

function draftTasks(draft: Awaited<ReturnType<typeof getDraft>>): PlanningTask[] {
  return (draft.content as { tasks: PlanningTask[] }).tasks;
}

function proposalDto(row: typeof planningProposal.$inferSelect, sourceVersion: number) {
  return {
    id: row.id,
    draftId: row.draftId,
    version: row.version,
    sourceVersion: row.sourceVersion,
    stale: row.sourceVersion !== sourceVersion,
    content: row.content,
    updatedAt: iso(row.updatedAt),
  };
}

export async function getAssignmentInputs(projectId: number, draftId: number) {
  const draft = await getDraft(projectId, draftId);
  return {
    draftId,
    sourceVersion: draft.version,
    tasks: draftTasks(draft),
    candidates: await planningCandidates(projectId),
  };
}

async function proposalInput(
  projectId: number,
  draftId: number,
  input: { sourceVersion: number; provisionalCandidates?: unknown; overrides?: unknown },
) {
  const draft = await getDraft(projectId, draftId);
  if (draft.version !== input.sourceVersion)
    throw new HttpError(409, 'The planning draft changed. Regenerate the proposal.');
  const candidates = [
    ...(await planningCandidates(projectId)),
    ...assertProvisionalCandidates(input.provisionalCandidates ?? []).map((candidate) => ({
      ...candidate,
      isRealMember: false,
    })),
  ];
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const actionableTaskIds = new Set(
    buildAssignmentProposal(draftTasks(draft), candidates).assignments.map(
      (assignment) => assignment.taskId,
    ),
  );
  const overrides: AssignmentOverrides = {};
  if (input.overrides !== undefined) {
    if (!input.overrides || typeof input.overrides !== 'object')
      throw new HttpError(400, 'Invalid assignment overrides');
    for (const [taskId, candidateId] of Object.entries(input.overrides)) {
      if (
        candidateId !== null &&
        (typeof candidateId !== 'string' || !candidateIds.has(candidateId))
      )
        throw new HttpError(400, 'Assignment override references an unavailable candidate');
      if (!actionableTaskIds.has(taskId))
        throw new HttpError(400, 'Assignment override references an invalid task');
      overrides[taskId] = candidateId as string | null;
    }
  }
  return { draft, candidates, overrides, actionableTaskIds, candidateIds };
}

const enrichmentSchema = z.object({
  explanations: z
    .array(
      z.object({
        taskId: z.string(),
        explanation: z.string().trim().min(1).max(500),
      }),
    )
    .max(50),
  warnings: z.array(z.string().trim().min(1).max(500)).max(20),
});

async function enrichProposal(
  projectId: number,
  userId: string,
  agentId: number,
  proposal: ReturnType<typeof buildAssignmentProposal>,
  candidates: PlanningCandidate[],
) {
  const row = await getAgentInProject(agentId, projectId);
  if (!row || row.kind !== 'internal')
    throw new HttpError(400, 'Select an internal planning agent');
  assertChatEnabled(row);
  const refused = await runRefusal({ agentId: row.id, teamId: row.teamId, projectId, userId });
  if (refused) throw new HttpError(403, refused);
  const model = await resolveModel(row, crypto.randomUUID());
  const agent = new Agent({
    id: `planning-assignment-${row.id}`,
    name: 'Assignment planning',
    instructions:
      'Explain the provided deterministic assignment proposal. Do not change task IDs, candidate IDs, assignments, estimates, capacity, dependencies, or warnings. Return only concise business-facing explanations in the language used by the task titles.',
    model,
    tools: {},
    maxRetries: 0,
  });
  agent.__registerMastra(getMastra());
  const result = await agent.generate(
    JSON.stringify({
      candidates: candidates.map(({ id, name, skills, isRealMember }) => ({
        id,
        name,
        skills,
        isRealMember,
      })),
      assignments: proposal.assignments,
      warnings: proposal.warnings,
    }),
    {
      structuredOutput: { schema: enrichmentSchema },
      maxSteps: 1,
      maxProcessorRetries: 0,
      modelSettings: { maxRetries: 0, maxOutputTokens: 4000 },
    },
  );
  const taskIds = new Set(proposal.assignments.map((assignment) => assignment.taskId));
  const explanations = new Map(
    result.object.explanations
      .filter((item) => taskIds.has(item.taskId))
      .map((item) => [item.taskId, item.explanation]),
  );
  return {
    ...proposal,
    assignments: proposal.assignments.map((assignment) => ({
      ...assignment,
      reason: explanations.get(assignment.taskId) ?? assignment.reason,
    })),
    warnings: [...new Set([...proposal.warnings, ...result.object.warnings])],
    aiEnrichment: 'applied' as const,
  };
}

export async function generateAssignmentProposal(
  projectId: number,
  draftId: number,
  userId: string,
  input: {
    sourceVersion: number;
    provisionalCandidates?: unknown;
    overrides?: unknown;
    agentId?: number;
  },
) {
  const { draft, candidates, overrides } = await proposalInput(projectId, draftId, input);
  const deterministic = buildAssignmentProposal(draftTasks(draft), candidates, overrides);
  let proposal:
    | (ReturnType<typeof buildAssignmentProposal> & {
        aiEnrichment: 'applied' | 'not_requested' | 'failed';
      })
    | undefined;
  if (!input.agentId) {
    proposal = { ...deterministic, aiEnrichment: 'not_requested' };
  } else {
    try {
      proposal = {
        ...(await enrichProposal(projectId, userId, input.agentId, deterministic, candidates)),
        aiEnrichment: 'applied',
      };
    } catch (error) {
      console.error('[Planning Assignment AI Enrichment Error]', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
      });
      proposal = {
        ...deterministic,
        aiEnrichment: 'failed',
        warnings: [
          ...deterministic.warnings,
          'AI explanation was unavailable. The rule-based proposal is shown for review.',
        ],
      };
    }
  }
  return {
    sourceVersion: draft.version,
    candidates,
    ...proposal,
  };
}

export async function getAssignmentProposal(projectId: number, draftId: number) {
  const draft = await getDraft(projectId, draftId);
  const [row] = await db
    .select()
    .from(planningProposal)
    .where(eq(planningProposal.draftId, draftId));
  return row ? proposalDto(row, draft.version) : null;
}

function retainProposalExplanation(
  deterministic: ReturnType<typeof buildAssignmentProposal>,
  value: unknown,
) {
  if (!value || typeof value !== 'object') return deterministic;
  const proposal = value as Record<string, unknown>;
  if (!Array.isArray(proposal.assignments))
    throw new HttpError(400, 'Invalid proposal assignments');
  const byTask = new Map(
    deterministic.assignments.map((assignment) => [assignment.taskId, assignment]),
  );
  const seenTaskIds = new Set<string>();
  const assignments = proposal.assignments.map((item) => {
    if (!item || typeof item !== 'object') throw new HttpError(400, 'Invalid proposal assignment');
    const candidate = item as Record<string, unknown>;
    const taskId = candidate.taskId;
    const expected = typeof taskId === 'string' ? byTask.get(taskId) : undefined;
    if (!expected || seenTaskIds.has(taskId as string) || typeof candidate.reason !== 'string')
      throw new HttpError(400, 'Invalid proposal assignment');
    seenTaskIds.add(taskId as string);
    return { ...expected, reason: candidate.reason };
  });
  if (
    assignments.length !== deterministic.assignments.length ||
    seenTaskIds.size !== deterministic.assignments.length
  )
    throw new HttpError(400, 'Proposal assignments are incomplete');
  return {
    ...deterministic,
    assignments,
    aiEnrichment:
      proposal.aiEnrichment === 'applied' || proposal.aiEnrichment === 'failed'
        ? proposal.aiEnrichment
        : 'not_requested',
  };
}

function proposalOverrides(
  value: unknown,
  actionableTaskIds: Set<string>,
  candidateIds: Set<string>,
) {
  if (value === undefined) return {} satisfies AssignmentOverrides;
  if (!value || typeof value !== 'object') throw new HttpError(400, 'Invalid assignment proposal');
  const proposal = value as Record<string, unknown>;
  if (!Array.isArray(proposal.assignments))
    throw new HttpError(400, 'Invalid proposal assignments');
  const overrides: AssignmentOverrides = {};
  for (const item of proposal.assignments) {
    if (!item || typeof item !== 'object') throw new HttpError(400, 'Invalid proposal assignment');
    const assignment = item as Record<string, unknown>;
    if (
      typeof assignment.taskId !== 'string' ||
      !actionableTaskIds.has(assignment.taskId) ||
      (assignment.candidateId !== null &&
        (typeof assignment.candidateId !== 'string' || !candidateIds.has(assignment.candidateId)))
    )
      throw new HttpError(400, 'Invalid proposal assignment');
    if (Object.prototype.hasOwnProperty.call(overrides, assignment.taskId))
      throw new HttpError(400, 'Duplicate proposal assignment');
    overrides[assignment.taskId] = assignment.candidateId as string | null;
  }
  return overrides;
}

export async function saveAssignmentProposal(
  projectId: number,
  draftId: number,
  actor: string,
  input: {
    sourceVersion: number;
    provisionalCandidates?: unknown;
    overrides?: unknown;
    proposal?: unknown;
    version?: number;
  },
) {
  const { draft, candidates, overrides, actionableTaskIds, candidateIds } = await proposalInput(
    projectId,
    draftId,
    input,
  );
  const persistedOverrides = proposalOverrides(input.proposal, actionableTaskIds, candidateIds);
  const deterministic = buildAssignmentProposal(draftTasks(draft), candidates, {
    ...persistedOverrides,
    ...overrides,
  });
  const content = {
    sourceVersion: draft.version,
    candidates,
    ...retainProposalExplanation(deterministic, input.proposal),
  };
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(planningProposal)
      .where(eq(planningProposal.draftId, draftId));
    if (existing && existing.version !== input.version)
      throw new HttpError(409, 'This proposal changed. Reopen the latest proposal before saving.');
    const [row] = existing
      ? await tx
          .update(planningProposal)
          .set({
            sourceVersion: draft.version,
            version: existing.version + 1,
            content,
            createdByUserId: actor,
            updatedAt: new Date(),
          })
          .where(
            and(eq(planningProposal.id, existing.id), eq(planningProposal.version, input.version!)),
          )
          .returning()
      : await tx
          .insert(planningProposal)
          .values({ draftId, sourceVersion: draft.version, content, createdByUserId: actor })
          .returning();
    if (!row)
      throw new HttpError(409, 'This proposal changed. Reopen the latest proposal before saving.');
    return proposalDto(row, draft.version);
  });
}
