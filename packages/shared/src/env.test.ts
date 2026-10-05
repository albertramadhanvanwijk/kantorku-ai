import { describe, it, expect } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv (shared)', () => {
  it('parses minimal valid env', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(env.DATABASE_URL).toBeDefined();
    expect(env.PORT).toBe(4000);
  });

  it('rejects missing DATABASE_URL', () => {
    expect(() =>
      parseEnv({
        REDIS_URL: 'redis://localhost:6379',
      } as any),
    ).toThrow(/DATABASE_URL/);
  });

  it('coerces PORT from string', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgresql://x',
      REDIS_URL: 'redis://x',
      PORT: '5000' as any,
    });
    expect(env.PORT).toBe(5000);
  });
});