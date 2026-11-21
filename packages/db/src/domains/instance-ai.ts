import { readSecret } from '../secrets';

export const INSTANCE_AI_SECRET_KEY = 'ai.provider';

export interface InstanceAiConfig {
  enabled: boolean;
  allowProjects: boolean;
  providerId: 'openai';
  model: string;
  apiKey: string;
}

export function defaultInstanceAiConfig(): InstanceAiConfig {
  return {
    enabled: false,
    allowProjects: false,
    providerId: 'openai',
    model: 'gpt-5-mini',
    apiKey: '',
  };
}

export async function getInstanceAiConfig(): Promise<InstanceAiConfig | null> {
  const stored = await readSecret<InstanceAiConfig>(INSTANCE_AI_SECRET_KEY);
  return stored ? { ...defaultInstanceAiConfig(), ...stored } : null;
}

export async function getProjectAiConfig(): Promise<InstanceAiConfig | null> {
  const config = await getInstanceAiConfig();
  if (!config?.enabled || !config.allowProjects || !config.apiKey.trim()) return null;
  return config;
}
