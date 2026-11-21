import { Agent } from '@mastra/core/agent';
import { resolvePlatformModel } from '#modules/agents/core/runtime/index';
import { getMastra } from '#modules/agents/core/runtime/observability';
import { HttpError } from '#shared/lib';
import {
  buildDeliverableReviewPrompt,
  deliverableReviewSchema,
  REVIEW_INSTRUCTIONS,
  type DeliverableReviewContent,
} from './review-contract';

function errorMetadata(error: unknown) {
  if (!(error instanceof Error)) return { type: typeof error };
  const details = error as Error & {
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
    issues?: { code?: unknown; path?: unknown }[];
  };
  return {
    name: details.name,
    code: typeof details.code === 'string' ? details.code : undefined,
    status:
      typeof details.status === 'number'
        ? details.status
        : typeof details.statusCode === 'number'
          ? details.statusCode
          : undefined,
    validationIssues: Array.isArray(details.issues)
      ? details.issues.map((issue) => ({ code: issue.code, path: issue.path }))
      : undefined,
  };
}

export async function generateDeliverableReview(input: {
  issueTitle: string;
  issueDescription: string;
  filename: string;
  documentText: string;
  projectId: number;
  issueId: number;
  userId: string;
}): Promise<DeliverableReviewContent & { model: string; reviewedAt: string }> {
  const model = await resolvePlatformModel();
  const agent = new Agent({
    id: 'deliverable-review',
    name: 'Deliverable review',
    instructions: REVIEW_INSTRUCTIONS,
    model,
    tools: {},
    maxRetries: 0,
  });
  agent.__registerMastra(getMastra());
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new HttpError(504, 'AI review timed out'));
      }, 180_000);
    });
    const result = await Promise.race([
      agent.generate(buildDeliverableReviewPrompt(input), {
        structuredOutput: { schema: deliverableReviewSchema },
        maxSteps: 1,
        maxProcessorRetries: 0,
        abortSignal: controller.signal,
        modelSettings: { maxOutputTokens: 4000, maxRetries: 0 },
        tracingOptions: {
          metadata: {
            projectId: input.projectId,
            issueId: input.issueId,
            userId: input.userId,
            feature: 'deliverable-review',
          },
        },
      }),
      timeout,
    ]);
    const review = deliverableReviewSchema.parse(result.object);
    return { ...review, model: model.modelId, reviewedAt: new Date().toISOString() };
  } catch (error) {
    console.error('[deliverables] AI review generation failed', {
      projectId: input.projectId,
      issueId: input.issueId,
      ...errorMetadata(error),
    });
    if (error instanceof HttpError) throw error;
    if (controller.signal.aborted) throw new HttpError(504, 'AI review timed out');
    throw new HttpError(502, 'AI review could not be completed');
  } finally {
    clearTimeout(timer!);
  }
}
