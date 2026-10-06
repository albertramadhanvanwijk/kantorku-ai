import * as shared from '@kantorku/shared';
import { AppError } from '@kantorku/shared';
import type { Logger } from '../../logger.js';
import type { ChatRequest, ChatResponse, ModelSpec, RoutingPolicy } from './nineRouter.types.js';

export interface NineRouterGatewayOpts {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  logger: Logger;
  fetchImpl?: typeof fetch;
  cache?: Map<string, { at: number; value: ModelSpec[] }>;
  timeoutMs?: number;
}

const CACHE_KEY = 'models';
const CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 60_000;

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

export class NineRouterGateway {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch;
  private readonly cache: Map<string, { at: number; value: ModelSpec[] }>;
  private readonly timeoutMs: number;

  constructor(opts: NineRouterGatewayOpts) {
    this.baseUrl = stripTrailingSlash(opts.baseUrl);
    this.apiKey = opts.apiKey;
    this.defaultModel = opts.defaultModel;
    this.logger = opts.logger;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as typeof fetch);
    this.cache = opts.cache ?? new Map();
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async listModels(): Promise<ModelSpec[]> {
    const cached = this.cache.get(CACHE_KEY);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.value;
    }
    const res = await this.fetchImpl(`${this.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      throw new AppError('PROVIDER_ERROR', `listModels failed: ${res.status}`, 502, {
        status: res.status,
      });
    }
    const json = (await res.json()) as unknown;
    const raw: unknown[] = Array.isArray(json)
      ? (json as unknown[])
      : Array.isArray((json as { data?: unknown }).data)
        ? ((json as { data: unknown[] }).data as unknown[])
        : [];
    const models: ModelSpec[] = raw.map((m) => {
      const r = m as Record<string, unknown>;
      return {
        id: String(r['id'] ?? r['model'] ?? 'unknown'),
        name: String(r['name'] ?? r['id'] ?? 'unknown'),
        maxTokens: Number(r['maxTokens'] ?? r['max_tokens'] ?? 4096),
        costPer1kInput: Number(r['costPer1kInput'] ?? 0.005),
        costPer1kOutput: Number(r['costPer1kOutput'] ?? 0.005),
        capabilities: (r['capabilities'] as ModelSpec['capabilities']) ?? [],
      };
    });
    this.cache.set(CACHE_KEY, { at: Date.now(), value: models });
    return models;
  }

  async chat(req: ChatRequest, policy?: RoutingPolicy): Promise<ChatResponse> {
    const primaryModel = req.model || this.defaultModel;
    const fallbackModel = policy?.fallbackModels?.[0];

    const attempt = async (modelToUse: string): Promise<ChatResponse> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const start = Date.now();
      try {
        const body: Record<string, unknown> = {
          model: modelToUse,
          messages: req.messages,
        };
        if (req.tools) body['tools'] = req.tools;
        if (req.responseFormat) body['response_format'] = req.responseFormat;
        if (req.temperature !== undefined) body['temperature'] = req.temperature;
        if (req.maxTokens !== undefined) body['max_tokens'] = req.maxTokens;

        const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const latencyMs = Date.now() - start;

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const err = new AppError(
            'PROVIDER_ERROR',
            `9Router chat failed: ${res.status}`,
            502,
            { status: res.status, body: text.slice(0, 500) },
          );
          // attach http status for fallback decision
          (err as unknown as Record<string, unknown>)['_httpStatus'] = res.status;
          throw err;
        }

        const json = (await res.json()) as Record<string, unknown>;
        const choices = json['choices'] as Array<Record<string, unknown>> | undefined;
        const firstChoice = choices?.[0] as Record<string, unknown> | undefined;
        const msg = firstChoice?.['message'] as Record<string, unknown> | undefined;
        const content =
          (msg?.['content'] as string | undefined) ??
          (firstChoice?.['text'] as string | undefined) ??
          (json['content'] as string | undefined) ??
          '';

        const u = json['usage'] as Record<string, unknown> | undefined;
        let usage: ChatResponse['usage'] | undefined;
        if (u) {
          usage = {
            promptTokens: Number(u['prompt_tokens'] ?? u['promptTokens'] ?? 0),
            completionTokens: Number(u['completion_tokens'] ?? u['completionTokens'] ?? 0),
            totalTokens: Number(u['total_tokens'] ?? u['totalTokens'] ?? 0),
            costUsd:
              u['cost'] !== undefined
                ? Number(u['cost'])
                : u['costUsd'] !== undefined
                  ? Number(u['costUsd'])
                  : undefined,
          };
        }

        let parsedJson: unknown | undefined;
        if (req.responseFormat) {
          try {
            parsedJson = JSON.parse(content);
          } catch {
            // leave undefined
          }
        }

        // debug only, never info with messages
        this.logger.debug(
          { model: modelToUse, latencyMs, correlationId: req.correlationId },
          '9router chat ok',
        );

        return {
          model: String(json['model'] ?? modelToUse),
          provider: '9router',
          content,
          parsedJson,
          usage,
          latencyMs,
          fallbackUsed: false,
        };
      } catch (e: unknown) {
        // Normalize any AbortError/DOMException abort to TIMEOUT — check both instanceof and duck-typed
        const isAbort =
          (e instanceof Error && e.name === 'AbortError') ||
          (typeof e === 'object' &&
            e !== null &&
            'name' in e &&
            (e as { name: unknown }).name === 'AbortError') ||
          (e instanceof Error && e.message.toLowerCase().includes('aborted'));
        if (isAbort) {
          throw shared.timeoutError(`9Router chat timeout after ${this.timeoutMs}ms`, {
            model: modelToUse,
            timeoutMs: this.timeoutMs,
          });
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      const res = await attempt(primaryModel);
      return res;
    } catch (primaryError: unknown) {
      const isRetriable = isRetriableError(primaryError);
      if (!isRetriable || !fallbackModel) {
        // Map timeout already is TIMEOUT; otherwise ensure PROVIDER_ERROR
        if (primaryError instanceof AppError && primaryError.code === 'TIMEOUT') throw primaryError;
        if (primaryError instanceof AppError && primaryError.code === 'PROVIDER_ERROR') throw primaryError;
        throw new AppError('PROVIDER_ERROR', (primaryError as Error).message ?? 'Provider error', 502, {
          cause: String(primaryError),
        });
      }

      // One fallback attempt
      this.logger.debug(
        { from: primaryModel, to: fallbackModel, correlationId: req.correlationId },
        '9router fallback',
      );
      try {
        const fbRes = await attempt(fallbackModel);
        return {
          ...fbRes,
          fallbackUsed: true,
          fallbackFrom: primaryModel,
        };
      } catch (fallbackError: unknown) {
        // Both failed — surface PROVIDER_ERROR with both details
        if (fallbackError instanceof AppError && fallbackError.code === 'TIMEOUT') {
          throw new AppError('PROVIDER_ERROR', 'Both primary and fallback timed out', 502, {
            primary: serializeError(primaryError),
            fallback: serializeError(fallbackError),
          });
        }
        throw new AppError('PROVIDER_ERROR', 'Both primary and fallback failed', 502, {
          primary: serializeError(primaryError),
          fallback: serializeError(fallbackError),
        });
      }
    }
  }
}

function isRetriableError(err: unknown): boolean {
  if (err instanceof AppError) {
    if (err.code === 'TIMEOUT') return true;
    if (err.code === 'PROVIDER_ERROR') {
      const details = err.details as Record<string, unknown> | undefined;
      const status = (err as unknown as Record<string, unknown>)['_httpStatus'] as number | undefined;
      const dStatus = details?.['status'] as number | undefined;
      const s = status ?? dStatus;
      if (s === 429) return true;
      if (s !== undefined && s >= 500) return true;
    }
  }
  return false;
}

function serializeError(err: unknown): unknown {
  if (err instanceof AppError) {
    return { code: err.code, message: err.message, details: err.details, statusCode: err.statusCode };
  }
  if (err instanceof Error) return { message: err.message, name: err.name };
  return String(err);
}
