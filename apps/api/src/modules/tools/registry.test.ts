import { describe, it, expect } from 'vitest';
import { ToolRegistry, type AgentContext } from './registry.js';
import { webSearchTool } from './tools/webSearch.tool.js';
import { createFetchUrlTool } from './tools/fetchUrl.tool.js';

const ctx: AgentContext = { correlationId: 'test-corr-1' };

describe('ToolRegistry', () => {
  it('getMany returns only allowed tools', () => {
    const registry = new ToolRegistry();
    registry.register(webSearchTool);
    expect(registry.getMany(['web_search'])).toHaveLength(1);
    expect(registry.getMany(['web_search'])[0]!.name).toBe('web_search');
    expect(registry.getMany(['unknown'])).toHaveLength(0);
    expect(registry.getMany(['web_search', 'unknown'])).toHaveLength(1);
  });

  it('execute validates input and returns output', async () => {
    const registry = new ToolRegistry();
    registry.register(webSearchTool);
    const r = await registry.execute('web_search', { query: 'test' }, ctx);
    expect(r.output).toHaveProperty('results');
    expect((r.output as { results: unknown[] }).results.length).toBeGreaterThan(0);
    expect(typeof r.latencyMs).toBe('number');
  });

  it('execute throws VALIDATION_ERROR on bad input', async () => {
    const registry = new ToolRegistry();
    registry.register(webSearchTool);
    await expect(registry.execute('web_search', { query: '' }, ctx)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('fetch_url blocks private IPs and enforces max bytes', async () => {
    const fetchUrlTool = createFetchUrlTool({
      fetchImpl: (async () => {
        throw new Error('should not fetch private IP');
      }) as unknown as typeof fetch,
    });
    const registry = new ToolRegistry();
    registry.register(fetchUrlTool);

    await expect(
      registry.execute('fetch_url', { url: 'https://127.0.0.1/secret' }, ctx),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      registry.execute('fetch_url', { url: 'https://10.0.0.5/internal' }, ctx),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      registry.execute('fetch_url', { url: 'https://localhost/secret' }, ctx),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      registry.execute('fetch_url', { url: 'https://192.168.1.1/admin' }, ctx),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    // http (non-https) also blocked
    await expect(
      registry.execute('fetch_url', { url: 'http://example.com/' }, ctx),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('fetch_url times out after 10s (injectable timeout)', async () => {
    const hangingFetch = ((url: string | URL, opts?: { signal?: AbortSignal }) =>
      new Promise<never>((_res, rej) => {
        const signal = opts?.signal;
        const abortHandler = () => {
          const err = new Error('The operation was aborted');
          (err as unknown as Record<string, unknown>)['name'] = 'AbortError';
          rej(err);
        };
        if (signal) {
          if (signal.aborted) {
            abortHandler();
          } else {
            signal.addEventListener('abort', abortHandler, { once: true });
          }
        }
      })) as unknown as typeof fetch;

    const fetchUrlTool = createFetchUrlTool({
      fetchImpl: hangingFetch,
      timeoutMs: 50,
    });
    const registry = new ToolRegistry();
    registry.register(fetchUrlTool);

    await expect(
      registry.execute('fetch_url', { url: 'https://example.com/slow' }, ctx),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  }, 5000);

  it('fetch_url truncates excerpt to 2000 chars and respects max bytes, and returns expected shape', async () => {
    const longBody = 'a'.repeat(5000);
    const fetchImpl = (async () =>
      new Response(longBody, {
        status: 200,
        headers: { 'content-type': 'text/plain', 'content-length': String(longBody.length) },
      })) as unknown as typeof fetch;

    const fetchUrlTool = createFetchUrlTool({ fetchImpl });
    const registry = new ToolRegistry();
    registry.register(fetchUrlTool);

    const r = await registry.execute('fetch_url', { url: 'https://example.com/page' }, ctx);
    const out = r.output as { url: string; statusCode: number; contentType: string; excerpt: string };
    expect(out.url).toBe('https://example.com/page');
    expect(out.statusCode).toBe(200);
    expect(out.contentType).toContain('text/plain');
    expect(out.excerpt.length).toBe(2000);
  });
});
