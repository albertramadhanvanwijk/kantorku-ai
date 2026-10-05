import { parseEnv } from '@kantorku/shared';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// In dev: __dirname = apps/api/src, in prod: __dirname = apps/api/dist
// Go up to project root: from src -> ../../.., from dist -> ../../..
const projectRoot = resolve(__dirname, '../../..');
const envPath = resolve(projectRoot, '.env');

dotenv.config({ path: envPath });

export function loadConfig() {
  return parseEnv(process.env as Record<string, string | undefined>);
}

export type AppConfig = ReturnType<typeof loadConfig>;
