import { z } from 'zod';
import * as shared from '@kantorku/shared';
import type { ToolHandler, AgentContext } from '../registry.js';

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_BYTES = 1_048_576; // 1 MB
export const EXCERPT_LEN = 2000;

export const fetchUrlInputSchema = z.object({
  url: z.string().url(),
});

export const fetchUrlOutputSchema = z.object({
  url: z.string(),
  statusCode: z.number(),
  contentType: z.string(),
  excerpt: z.string(),
});

export type FetchUrlInput = z.infer<typeof fetchUrlInputSchema>;
export type FetchUrlOutput = z.infer<typeof fetchUrlOutputSchema>;

/**
 * Regex/pattern checks for private / loopback hostnames and IP ranges.
 * Mirrors spec security requirement: block localhost/127.0.0.1/10.* etc.
 */
const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^169\.254\.\d+\.\d+$/,
];

function isPrivateHostname(hostname: string): boolean {
  // Strip brackets for IPv6 literals like [::1]
  const normalized = hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
  if (normalized === '::1' || normalized === '::ffff:127.0.0.1') return true;
  if (normalized.startsWith('::ffff:10.') || normalized.startsWith('::ffff:192.168.')) return true;
  return PRIVATE_HOST_PATTERNS.some((re) => re.test(normalized));
}

export interface CreateFetchUrlToolOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

export function createFetchUrlTool(opts?: CreateFetchUrlToolOptions): ToolHandler {
  const fetchImpl: typeof fetch =
    opts?.fetchImpl ?? (globalThis.fetch as unknown as typeof fetch);
  const timeoutMs = opts?.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = opts?.maxBytes ?? MAX_BYTES;

  return {
    definition: {
      name: 'fetch_url',
      description:
        'Fetch a URL over HTTPS. Blocks private IPs, enforces 10s timeout and 1 MB max, returns excerpt of first 2000 characters.',
      inputSchema: fetchUrlInputSchema,
      outputSchema: fetchUrlOutputSchema,
    },
    async execute(input: unknown, _ctx: AgentContext): Promise<unknown> {
      const parsed = fetchUrlInputSchema.parse(input) as FetchUrlInput;
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(parsed.url);
      } catch {
        throw shared.validationError(`Invalid URL: ${parsed.url}`);
      }

      if (parsedUrl.protocol !== 'https:') {
        throw shared.validationError(`Only https URLs are allowed: ${parsed.url}`);
      }

      if (isPrivateHostname(parsedUrl.hostname)) {
        throw shared.validationError(`Blocked private/local URL: ${parsed.url}`);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        let res: Response;
        try {
          res = await fetchImpl(parsed.url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: { Accept: 'text/html, text/plain, application/json, */*' },
          } as RequestInit);
        } catch (e: unknown) {
          const isAbort =
            (e instanceof Error && e.name === 'AbortError') ||
            (typeof e === 'object' &&
              e !== null &&
              'name' in e &&
              (e as { name: unknown }).name === 'AbortError') ||
            (e instanceof Error && e.message.toLowerCase().includes('aborted'));
          if (isAbort) {
            throw shared.timeoutError(`fetch_url timeout after ${timeoutMs}ms for ${parsed.url}`, {
              url: parsed.url,
              timeoutMs,
            });
          }
          throw e;
        }

        const statusCode = res.status;
        const contentType = res.headers.get('content-type') ?? 'text/plain';

        // Enforce 1 MB max via Content-Length fast-path
        const contentLengthHeader = res.headers.get('content-length');
        if (contentLengthHeader) {
          const contentLength = Number(contentLengthHeader);
          if (Number.isFinite(contentLength) && contentLength > maxBytes) {
            // Still read but will truncate; no need to throw — spec says enforce max bytes
            // We proceed and truncate the body below.
          }
        }

        // Read body with byte cap. Prefer streaming if available and maxBytes matters,
        // but for simplicity read as text and truncate by byte length.
        let text: string;
        try {
          // Use arrayBuffer to accurately enforce byte limit
          const buf = await res.arrayBuffer();
          const bytes = new Uint8Array(buf);
          const capped =
            bytes.length > maxBytes ? bytes.slice(0, maxBytes) : bytes;
          text = new TextDecoder('utf-8', { fatal: false }).decode(capped);
        } catch {
          // Fallback to text() if arrayBuffer fails
          const raw = await res.text().catch(() => '');
          const encoder = new TextEncoder();
          const bytes = encoder.encode(raw);
          text = bytes.length > maxBytes
            ? new TextDecoder().decode(bytes.slice(0, maxBytes))
            : raw;
        }

        const excerpt = text.slice(0, EXCERPT_LEN);

        const output: FetchUrlOutput = {
          url: parsed.url,
          statusCode,
          contentType,
          excerpt,
        };

        return output;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Default singleton using global fetch and spec defaults (10 s, 1 MB).
 */
export const fetchUrlTool: ToolHandler = createFetchUrlTool();
