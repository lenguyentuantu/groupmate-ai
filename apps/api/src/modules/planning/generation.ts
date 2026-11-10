import { Agent } from '@mastra/core/agent';
import { getAgentInProject, assertChatEnabled } from '#modules/agents/core/service';
import { resolveModel } from '#modules/agents/core/runtime/index';
import { getMastra } from '#modules/agents/core/runtime/observability';
import { runRefusal } from '#modules/agents/core/run-refusal';
import { HttpError } from '#shared/lib';
import { getDraft } from './service';
import { buildPlanningPrompt, PLANNING_INSTRUCTIONS } from './instructions';
import {
  generatedPlanSchema,
  validateGeneratedPlan,
  validatePlan,
  type PlanSource,
} from './validation';
const running = new Set<string>();
export async function generateDraft(
  projectId: number,
  draftId: number,
  userId: string,
  input: { agentId: number; version: number },
) {
  const draft = await getDraft(projectId, draftId);
  if (draft.version !== input.version)
    throw new HttpError(409, 'Draft changed. Reopen the latest version before generating.');
  const row = await getAgentInProject(input.agentId, projectId);
  if (!row || row.kind !== 'internal')
    throw new HttpError(400, 'Select an internal agent configured for this project');
  assertChatEnabled(row);
  const refused = await runRefusal({ agentId: row.id, teamId: row.teamId, projectId, userId });
  if (refused) throw new HttpError(403, refused);
  const key = `${projectId}:${draftId}`;
  const model = await resolveModel(row, crypto.randomUUID());
  const sources = draft.sources as PlanSource[];
  const content = validatePlan(draft.content, sources);
  if (!content.brief.trim() && !sources.length)
    throw new HttpError(400, 'Provide a brief or source document');
  const prompt = buildPlanningPrompt(content, sources);
  if (prompt.length > 120000) throw new HttpError(400, 'Model input exceeds 120,000 characters');
  if (running.has(key) || running.size >= 5)
    throw new HttpError(409, 'Generation is already running; try again later');
  running.add(key);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  try {
    const agent = new Agent({
      id: `planning-${row.id}`,
      name: 'Project planning',
      instructions: PLANNING_INSTRUCTIONS,
      model,
      tools: {},
      maxRetries: 0,
    });
    agent.__registerMastra(getMastra());
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new HttpError(504, 'Planning generation timed out. Your saved draft is unchanged.'));
      }, 60000);
    });
    const result = await Promise.race([
      agent.generate(prompt, {
        structuredOutput: { schema: generatedPlanSchema },
        maxSteps: 1,
        // Mastra error processors retry separately from model retries.
        maxProcessorRetries: 0,
        abortSignal: controller.signal,
        modelSettings: { maxOutputTokens: 16000, maxRetries: 0 },
        tracingOptions: {
          metadata: {
            agentId: row.id,
            teamId: row.teamId,
            projectId,
            userId,
            planningDraftId: draftId,
          },
        },
      }),
      timeout,
    ]);
    const generated = validateGeneratedPlan(result.object, content, sources);
    if ((await getDraft(projectId, draftId)).version !== input.version)
      throw new HttpError(409, 'Draft changed during generation. Your saved edits are unchanged.');
    return { ...generated, version: draft.version };
  } catch (error) {
    // Temporary diagnostic logging for P2 AI Generation
    console.error('[P2 Generation Error]', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof HttpError && [409, 504].includes(error.status)) throw error;
    if (error instanceof HttpError && error.status === 400)
      throw new HttpError(
        502,
        `Invalid planning output: ${error.message}. Your saved draft is unchanged.`,
      );
    throw new HttpError(
      502,
      'Provider unavailable or invalid planning output. Your saved draft is unchanged.',
    );
  } finally {
    clearTimeout(timer!);
    running.delete(key);
  }
}
