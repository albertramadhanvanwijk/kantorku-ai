import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import { NineRouterGateway } from './nineRouter.gateway.js';
import type { ChatRequest } from './nineRouter.types.js';

const logger = pino({ level: 'silent' });

function makeGateway(opts?: {
  fetchImpl?: typeof fetch;
  cache?: Map<string, { at: number; value: unknown[] }>;
  timeoutMs?: number;
}) {
  return new NineRouterGateway({
    baseUrl: 'https://api.9router.test',
    apiKey: 'test-key',
    defaultModel: 'mid-research-v1',
    logger,
    fetchImpl: opts?.fetchImpl,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cache: opts?.cache as any,
    timeoutMs: opts?.timeoutMs,
  });
}

const baseReq: ChatRequest = {
  model: 'mid-research-v1',
  messages: [{ role: 'user', content: 'hi' }],
};

describe('NineRouterGateway', () => {
  it('chat returns usage + latency and caches listModels', async () => {
    let modelsFetchCount = 0;

    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/models')) {
        modelsFetchCount += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ id: 'mid-research-v1', name: 'Mid Research' }] }),
          text: async () => '',
        } as unknown as Response;
      }
      // chat
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: 'mid-research-v1',
          choices: [{ message: { content: '{"ok":1}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        text: async () => '',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const cache = new Map();
    const gw = makeGateway({ fetchImpl, cache });

    const m1 = await gw.listModels();
    expect(m1[0]?.id).toBe('mid-research-v1');
    const m2 = await gw.listModels();
    expect(m2).toEqual(m1);
    expect(modelsFetchCount).toBe(1);

    const res = await gw.chat(baseReq);
    expect(res.content).toBe('{"ok":1}');
    expect(res.provider).toBe('9router');
    expect(res.usage).toBeDefined();
    expect(res.usage?.promptTokens).toBe(10);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    expect(res.latencyMs).toBeLessThan(5000);
    expect(typeof res.latencyMs).toBe('number');
    expect(res.fallbackUsed).toBeFalsy();
  });

  it('falls back to next model on 429 then succeeds', async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return { ok: false, status: 429, text: async () => 'rate limited', json: async () => ({}) } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: 'low-research-v1',
          choices: [{ message: { content: '{"ok":2}' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        text: async () => '',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const gw = makeGateway({ fetchImpl });
    const res = await gw.chat(baseReq, {
      taskType: 'research',
      preferredModels: ['mid-research-v1'],
      fallbackModels: ['low-research-v1'],
    });
    expect(res.fallbackUsed).toBe(true);
    expect(res.fallbackFrom).toBe('mid-research-v1');
    expect(res.content).toBe('{"ok":2}');
  });

  it('throws PROVIDER_ERROR when primary+fallback both fail', async () => {
    const fetchImpl = vi.fn(async () => {
      return { ok: false, status: 500, text: async () => 'oops', json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch;

    const gw = makeGateway({ fetchImpl });
    await expect(
      gw.chat(baseReq, {
        taskType: 'research',
        preferredModels: ['mid-research-v1'],
        fallbackModels: ['low-research-v1'],
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });

    try {
      await gw.chat(baseReq, {
        taskType: 'research',
        preferredModels: ['mid-research-v1'],
        fallbackModels: ['low-research-v1'],
      });
    } catch (e) {
      const err = e as { details?: { primary?: unknown; fallback?: unknown } };
      expect(err.details).toHaveProperty('primary');
      expect(err.details).toHaveProperty('fallback');
    }
  });

  it('times out and surfaces TIMEOUT', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, _reject) => {
          // never resolve; abort will fire
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              const e = new Error('The operation was aborted');
              e.name = 'AbortError';
              // vitest will see rejection as timeoutError via gateway
              // but we need to propagate AbortError so gateway maps it
              // We reject fetch promise with AbortError
              // Use _reject instead
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (_reject as any)(e);
            });
          }
        }),
    ) as unknown as typeof fetch;

    const gw = makeGateway({ fetchImpl, timeoutMs: 50 });
    await expect(gw.chat(baseReq)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
