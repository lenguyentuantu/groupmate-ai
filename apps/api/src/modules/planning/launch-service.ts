import {
  aiAgent,
  db,
  issue,
  issueActivity,
  issueLink,
  issueStatus,
  planningApproval,
  planningDraft,
  planningProposal,
  project,
  projectColumn,
  projectMember,
  teamMember,
  user,
  type DbExecutor,
} from '@repo/db';
import { and, asc, desc, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { HttpError, iso } from '#shared/lib';
import {
  approveAndPublish,
  buildWorkItemDescription,
  mapPublishedWorkItems,
  type ApprovalCommand,
  type ApprovalReceipt,
  type ApprovalStore,
  type ApprovalTransaction,
  type WorkItemMapping,
} from './approval';
import {
  buildLaunchPreview,
  type BuildLaunchPreviewInput,
  type ExecutionBaseline,
  type LaunchMember,
} from './launch';
import { planSchema, type PlanSource } from './validation';

async function launchMembers(executor: DbExecutor, projectId: number): Promise<LaunchMember[]> {
  const [members, workloads] = await Promise.all([
    executor
      .select({
        id: projectMember.userId,
        name: user.name,
        skills: teamMember.skills,
        weeklyCapacityMinutes: teamMember.weeklyAvailabilityMinutes,
        agentId: aiAgent.id,
      })
      .from(projectMember)
      .innerJoin(user, eq(user.id, projectMember.userId))
      .innerJoin(project, eq(project.id, projectMember.projectId))
      .leftJoin(
        teamMember,
        and(eq(teamMember.teamId, project.teamId), eq(teamMember.userId, projectMember.userId)),
      )
      .leftJoin(aiAgent, eq(aiAgent.userId, projectMember.userId))
      .where(eq(projectMember.projectId, projectId)),
    executor
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
  return members
    .filter((member) => member.agentId === null)
    .map((member) => ({
      id: member.id,
      name: member.name,
      skills: (member.skills ?? []).map((skill) => skill.name),
      weeklyCapacityMinutes: member.weeklyCapacityMinutes,
      knownWorkloadMinutes: workloadById.get(member.id)?.knownWorkloadMinutes ?? 0,
      unknownWorkloadTasks: workloadById.get(member.id)?.unknownWorkloadTasks ?? 0,
    }));
}

async function readState(
  executor: DbExecutor,
  projectId: number,
  draftId: number,
): Promise<BuildLaunchPreviewInput | null> {
  const [projectRow] = await executor
    .select({ id: project.id, teamId: project.teamId, key: project.key, name: project.name })
    .from(project)
    .where(eq(project.id, projectId));
  if (!projectRow) return null;
  const [draftRow] = await executor
    .select()
    .from(planningDraft)
    .where(and(eq(planningDraft.id, draftId), eq(planningDraft.projectId, projectId)));
  if (!draftRow) return null;
  const [proposalRow] = await executor
    .select()
    .from(planningProposal)
    .where(eq(planningProposal.draftId, draftId));
  const [publishColumn] = await executor
    .select({
      id: projectColumn.id,
      wipLimit: projectColumn.wipLimit,
      wipMode: projectColumn.wipMode,
    })
    .from(projectColumn)
    .where(
      and(
        eq(projectColumn.projectId, projectId),
        sql`${projectColumn.stateType} in ('backlog', 'unstarted')`,
      ),
    )
    .orderBy(
      sql`case when ${projectColumn.stateType} = 'backlog' then 0 else 1 end`,
      asc(projectColumn.position),
    )
    .limit(1);
  const [{ count: publishColumnCount }] = publishColumn
    ? await executor
        .select({ count: sql<number>`count(*)::int` })
        .from(issue)
        .where(and(eq(issue.columnId, publishColumn.id), isNull(issue.archivedAt)))
    : [{ count: 0 }];
  const parsedPlan = planSchema.safeParse(draftRow.content);
  const actionableCount = parsedPlan.success
    ? parsedPlan.data.tasks.filter(
        (task) =>
          task.parentId !== null ||
          !parsedPlan.data.tasks.some((candidate) => candidate.parentId === task.id),
      ).length
    : 0;
  return {
    project: projectRow,
    draft: {
      id: draftRow.id,
      projectId: draftRow.projectId,
      version: draftRow.version,
      content: draftRow.content,
      sources: draftRow.sources as PlanSource[],
    },
    proposal: proposalRow
      ? {
          id: proposalRow.id,
          draftId: proposalRow.draftId,
          sourceVersion: proposalRow.sourceVersion,
          version: proposalRow.version,
          content: proposalRow.content,
        }
      : null,
    members: await launchMembers(executor, projectId),
    hasPublishColumn: Boolean(publishColumn),
    publishCapacityAvailable:
      !publishColumn ||
      publishColumn.wipMode !== 'hard' ||
      publishColumn.wipLimit === null ||
      publishColumnCount + actionableCount <= publishColumn.wipLimit,
  };
}

export async function getLaunchPreview(projectId: number, draftId: number) {
  const state = await readState(db, projectId, draftId);
  if (!state) throw new HttpError(404, 'Planning draft not found');
  return buildLaunchPreview(state);
}

function receiptDto(row: typeof planningApproval.$inferSelect): ApprovalReceipt {
  return {
    id: row.id,
    projectId: row.projectId,
    draftId: row.draftId,
    wbsVersion: row.sourceVersion,
    proposalId: row.proposalId,
    proposalVersion: row.proposalVersion,
    intentId: row.intentId,
    approvedByUserId: row.approvedByActorId,
    approvedByUserName: row.approvedByActorName,
    approvedAt: iso(row.approvedAt),
    acknowledgedRiskCodes: row.acknowledgedRiskCodes as string[],
    baseline: row.baseline as ExecutionBaseline,
    workItemMappings: row.workItemMappings as WorkItemMapping[],
  };
}

async function materializeWorkItems(
  tx: DbExecutor,
  baseline: ExecutionBaseline,
  actorUserId: string,
): Promise<WorkItemMapping[]> {
  const [column] = await tx
    .select({
      id: projectColumn.id,
      name: projectColumn.name,
      stateType: projectColumn.stateType,
      wipLimit: projectColumn.wipLimit,
      wipMode: projectColumn.wipMode,
    })
    .from(projectColumn)
    .where(
      and(
        eq(projectColumn.projectId, baseline.project.id),
        sql`${projectColumn.stateType} in ('backlog', 'unstarted')`,
      ),
    )
    .orderBy(
      sql`case when ${projectColumn.stateType} = 'backlog' then 0 else 1 end`,
      asc(projectColumn.position),
    )
    .limit(1);
  if (!column)
    throw new HttpError(409, 'No backlog or unstarted column is available.', 'P4_BLOCKED');
  if (column.wipMode === 'hard' && column.wipLimit !== null) {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(issue)
      .where(and(eq(issue.columnId, column.id), isNull(issue.archivedAt)));
    if (count + baseline.tasks.length > column.wipLimit)
      throw new HttpError(
        409,
        `Column "${column.name}" is at its WIP limit of ${column.wipLimit}`,
        'P4_BLOCKED',
      );
  }

  const [sequence] = await tx
    .select({ next: project.nextSequence })
    .from(project)
    .where(eq(project.id, baseline.project.id))
    .for('update');
  if (!sequence) throw new HttpError(404, 'Project not found');
  await tx
    .update(project)
    .set({ nextSequence: sql`${project.nextSequence} + ${baseline.tasks.length}` })
    .where(eq(project.id, baseline.project.id));
  const [{ position }] = await tx
    .select({ position: sql<number>`coalesce(max(${issue.position}), 0)` })
    .from(issue)
    .where(eq(issue.columnId, column.id));

  const inserted = await tx
    .insert(issue)
    .values(
      baseline.tasks.map((task, index) => ({
        projectId: baseline.project.id,
        sequenceNumber: sequence.next + index,
        columnId: column.id,
        assigneeUserId: task.assigneeUserId,
        title: task.title,
        description: buildWorkItemDescription(task),
        priority: task.priority,
        estimateMinutes: task.estimateMinutes,
        position: Number(position) + (index + 1) * 1000,
      })),
    )
    .returning({ id: issue.id, sequenceNumber: issue.sequenceNumber, createdAt: issue.createdAt });
  if (inserted.length !== baseline.tasks.length)
    throw new HttpError(
      500,
      'Work Item materialization was incomplete.',
      'P4_MATERIALIZATION_FAILED',
    );

  const published = baseline.tasks.map((task, index) => ({
    sourceTaskId: task.sourceTaskId,
    workItemId: inserted[index].id,
    sequenceNumber: inserted[index].sequenceNumber,
  }));
  const { dependencyLinks, workItemMappings } = mapPublishedWorkItems(baseline, published);
  await tx.insert(issueStatus).values(
    inserted.map((row) => ({
      issueId: row.id,
      columnId: column.id,
      columnName: column.name,
      stateType: column.stateType,
      enteredAt: row.createdAt,
    })),
  );
  const [actor] = await tx.select({ name: user.name }).from(user).where(eq(user.id, actorUserId));
  await tx.insert(issueActivity).values(
    inserted.map((row) => ({
      issueId: row.id,
      kind: 'activity',
      action: 'created',
      actorUserId,
      actorName: actor?.name ?? null,
      payload: {},
    })),
  );

  if (dependencyLinks.length) await tx.insert(issueLink).values(dependencyLinks);
  return workItemMappings;
}

function approvalTransaction(tx: DbExecutor): ApprovalTransaction {
  return {
    async loadState(command) {
      await tx
        .select({ id: project.id })
        .from(project)
        .where(eq(project.id, command.projectId))
        .for('update');
      await tx
        .select({ id: planningDraft.id })
        .from(planningDraft)
        .where(
          and(
            eq(planningDraft.id, command.draftId),
            eq(planningDraft.projectId, command.projectId),
          ),
        )
        .for('update');
      await tx
        .select({ id: planningProposal.id })
        .from(planningProposal)
        .where(eq(planningProposal.draftId, command.draftId))
        .for('update');
      await tx
        .select({ userId: projectMember.userId })
        .from(projectMember)
        .where(eq(projectMember.projectId, command.projectId))
        .for('share');
      const state = await readState(tx, command.projectId, command.draftId);
      if (!state) return null;
      const [approver] = await tx
        .select({ role: projectMember.role })
        .from(projectMember)
        .where(
          and(
            eq(projectMember.projectId, command.projectId),
            eq(projectMember.userId, command.actorUserId),
          ),
        );
      return { ...state, actorIsApprover: approver?.role === 'owner' };
    },
    async findReceipt(command) {
      const [row] = await tx
        .select()
        .from(planningApproval)
        .where(
          and(
            eq(planningApproval.projectId, command.projectId),
            eq(planningApproval.draftId, command.draftId),
            eq(planningApproval.sourceVersion, command.wbsVersion),
          ),
        );
      return row ? receiptDto(row) : null;
    },
    materialize: (baseline, actorUserId) => materializeWorkItems(tx, baseline, actorUserId),
    async saveReceipt({ command, baseline, proposalId, workItemMappings }) {
      const [actor] = await tx
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, command.actorUserId));
      if (!actor) throw new HttpError(403, 'Approval actor not found.', 'P4_FORBIDDEN');
      const [row] = await tx
        .insert(planningApproval)
        .values({
          projectId: command.projectId,
          draftId: command.draftId,
          sourceVersion: command.wbsVersion,
          proposalId,
          proposalVersion: command.proposalVersion,
          intentId: command.intentId,
          approvedByUserId: command.actorUserId,
          approvedByActorId: command.actorUserId,
          approvedByActorName: actor.name,
          acknowledgedRiskCodes: [...new Set(command.acknowledgedRiskCodes)].sort(),
          baseline,
          workItemMappings,
        })
        .returning();
      return receiptDto(row);
    },
  };
}

const approvalStore: ApprovalStore = {
  transaction: (operation) => db.transaction((tx) => operation(approvalTransaction(tx))),
};

export async function publishLaunch(command: ApprovalCommand) {
  try {
    return await approveAndPublish(approvalStore, command);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, 'Launch materialization failed.', 'P4_MATERIALIZATION_FAILED');
  }
}

export async function getLaunchReceipt(projectId: number, draftId: number) {
  const [row] = await db
    .select()
    .from(planningApproval)
    .where(and(eq(planningApproval.projectId, projectId), eq(planningApproval.draftId, draftId)))
    .orderBy(desc(planningApproval.approvedAt), desc(planningApproval.id))
    .limit(1);
  if (!row) throw new HttpError(404, 'Launch approval receipt not found');
  return receiptDto(row);
}
