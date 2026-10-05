import { parseEnv } from '@kantorku/shared';

export function loadConfig() {
  return parseEnv(process.env as Record<string, string | undefined>);
}

export type AppConfig = ReturnType<typeof loadConfig>;
