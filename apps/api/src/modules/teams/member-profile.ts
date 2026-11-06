import { db, aiAgent, issue, project, projectColumn, projectMember, teamMember } from '@repo/db';
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { projectsWithPermission, type TeamMembership } from '#shared/access';
import { HttpError } from '#shared/lib';
import { runsTeam } from './service';

interface MemberProfileInput {
  skills: { name: string; proficiency: number }[];
  weeklyAvailabilityMinutes: number | null;
  preferences: string;
}

async function humanMember(teamId: number, userId: string) {
  const [row] = await db
    .select({
      skills: teamMember.skills,
      weeklyAvailabilityMinutes: teamMember.weeklyAvailabilityMinutes,
      preferences: teamMember.preferences,
    })
    .from(teamMember)
    .leftJoin(aiAgent, eq(aiAgent.userId, teamMember.userId))
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId), isNull(aiAgent.id)));
  if (!row) throw new HttpError(404, 'Member profile not found');
  return row;
}

function canEditProfile(membership: TeamMembership, userId: string): boolean {
  return membership.role !== 'agent' && (membership.userId === userId || runsTeam(membership.role));
}

export async function getMemberProfile(
  membership: TeamMembership,
  userId: string,
  boundProject: number | null,
) {
  const projectIds = await projectsWithPermission(membership, 'work_items', 'read');
  if (boundProject !== null) {
    if (projectIds !== null && !projectIds.includes(boundProject)) {
      throw new HttpError(403, 'Cannot read this project');
    }
    const [member] = await db
      .select({ userId: projectMember.userId })
      .from(projectMember)
      .innerJoin(project, eq(project.id, projectMember.projectId))
      .where(
        and(
          eq(projectMember.projectId, boundProject),
          eq(projectMember.userId, userId),
          eq(project.teamId, membership.teamId),
        ),
      );
    if (!member) throw new HttpError(404, 'Member profile not found in this project');
  }
  const profile = await humanMember(membership.teamId, userId);
  const [workload] = await db
    .select({
      activeTasks: sql<number>`count(*)::int`,
      knownEstimateMinutes: sql<number>`coalesce(sum(${issue.estimateMinutes}), 0)::float8`,
      unknownEstimateTasks: sql<number>`count(*) filter (where ${issue.estimateMinutes} is null)::int`,
    })
    .from(issue)
    .innerJoin(project, eq(project.id, issue.projectId))
    .innerJoin(projectColumn, eq(projectColumn.id, issue.columnId))
    .where(
      and(
        eq(project.teamId, membership.teamId),
        eq(issue.assigneeUserId, userId),
        isNull(project.archivedAt),
        isNull(issue.archivedAt),
        notInArray(projectColumn.stateType, ['completed', 'canceled']),
        projectIds === null ? undefined : inArray(project.id, projectIds),
        boundProject === null ? undefined : eq(project.id, boundProject),
      ),
    );
  return {
    ...profile,
    canEdit: boundProject === null && canEditProfile(membership, userId),
    workload,
  };
}

export async function setMemberProfile(
  membership: TeamMembership,
  userId: string,
  input: MemberProfileInput,
) {
  if (!canEditProfile(membership, userId)) {
    throw new HttpError(403, 'Only this member or a team owner or manager can edit this profile');
  }
  await humanMember(membership.teamId, userId);
  const skills = input.skills.map(({ name, proficiency }) => ({ name: name.trim(), proficiency }));
  if (skills.some(({ name }) => !name)) throw new HttpError(400, 'Skill names cannot be blank');
  if (new Set(skills.map(({ name }) => name.toLowerCase())).size !== skills.length) {
    throw new HttpError(400, 'Skill names must be unique');
  }
  const [saved] = await db
    .update(teamMember)
    .set({
      skills,
      weeklyAvailabilityMinutes: input.weeklyAvailabilityMinutes,
      preferences: input.preferences.trim(),
    })
    .where(and(eq(teamMember.teamId, membership.teamId), eq(teamMember.userId, userId)))
    .returning({ userId: teamMember.userId });
  if (!saved) throw new HttpError(404, 'Member profile not found');
}
