import {
  defaultInstanceAiConfig,
  getInstanceAiConfig,
  INSTANCE_AI_SECRET_KEY,
  writeSecret,
} from '@repo/db';
import { HttpError } from '#shared/lib';

export async function getAiProviderSettings() {
  const config = (await getInstanceAiConfig()) ?? defaultInstanceAiConfig();
  return {
    enabled: config.enabled,
    allowProjects: config.allowProjects,
    providerId: config.providerId,
    model: config.model,
    hasApiKey: Boolean(config.apiKey),
  };
}

export async function setAiProviderSettings(input: {
  enabled?: boolean;
  allowProjects?: boolean;
  model?: string;
  apiKey?: string;
}) {
  const current = (await getInstanceAiConfig()) ?? defaultInstanceAiConfig();
  const apiKey = input.apiKey?.trim() || current.apiKey;
  const next = {
    ...current,
    ...input,
    apiKey,
    model: input.model?.trim() || current.model,
  };
  if ((next.enabled || next.allowProjects) && !apiKey) {
    throw new HttpError(400, 'An OpenAI API key is required before built-in AI can be enabled');
  }
  await writeSecret(INSTANCE_AI_SECRET_KEY, next, {
    enabled: next.enabled,
    allowProjects: next.allowProjects,
    providerId: next.providerId,
    model: next.model,
    hasApiKey: Boolean(next.apiKey),
  });
  return getAiProviderSettings();
}
