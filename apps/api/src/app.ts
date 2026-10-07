import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { AppError, toErrorEnvelope } from '@kantorku/shared';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { getPool } from './db/connection.js';
import authPlugin from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './modules/auth/auth.routes.js';

// Phase 2 imports
import { NineRouterGateway } from './modules/gateway/nineRouter.gateway.js';
import { ToolRegistry } from './modules/tools/registry.js';
import { webSearchTool } from './modules/tools/tools/webSearch.tool.js';
import { fetchUrlTool } from './modules/tools/tools/fetchUrl.tool.js';
import { AgentRegistry } from './modules/agents/registry.js';
import { AgentService } from './modules/agents/agent.service.js';
import { RunLogger } from './modules/runs/runLogger.js';
import { ExecutionStore } from './modules/orchestration/executionStore.js';
import { WorkflowEngine, createWorkflowQueue } from './modules/orchestration/workflowEngine.js';
import { WorkflowService } from './modules/orchestration/workflow.service.js';
import { agentsRoutes } from './modules/agents/agents.routes.js';
import { workflowsRoutes } from './modules/orchestration/workflows.routes.js';
import { approvalsRoutes } from './modules/orchestration/approvals.routes.js';
import { runsRoutes } from './modules/runs/runs.routes.js';
import { toolsRoutes } from './modules/tools/tools.routes.js';
import { registerConcreteAgents, ALL_AGENT_DEFINITIONS } from './modules/agents/agents/index.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { workflowDefinitions } from './db/schema.js';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { createStorageAdapter } from './modules/materials/storage/index.js';
import { MaterialsService } from './modules/materials/materials.service.js';
import { ClassificationService } from './modules/materials/classification.service.js';
import { SourcePacksService } from './modules/materials/sourcePacks.service.js';
import { materialsRoutes } from './modules/materials/materials.routes.js';
import { sourcePacksRoutes } from './modules/materials/sourcePacks.routes.js';

export interface BuildAppOptions {
  logger?: ReturnType<typeof createLogger> | false;
  pgPool?: InstanceType<typeof pg.Pool>;
  db?: ReturnType<typeof drizzle>;
}

export async function buildApp(opts: BuildAppOptions = {}) {
    const config = loadConfig();
    
    // Pass logger config directly to Fastify instead of pre-creating pino instance
    const loggerConfig = {
      level: config.LOG_LEVEL,
      base: { service: 'kantorku-api' },
    };
    const logger = opts.logger === false ? false : (opts.logger ?? loggerConfig);
    
    const app = Fastify({
        logger,
        trustProxy: true,
        genReqId: () => crypto.randomUUID(),
    });

  // Decorate config + infra for route handlers
  app.decorate('config', config);
  const isTestMode = opts.logger === false;
  const pgPool = opts.pgPool ?? getPool(config.DATABASE_URL);
  app.decorate('pgPool', pgPool);

  // Redis is optional — skip in test mode (logger === false) to avoid connection timeouts
  let redis: any = null;
  if (!isTestMode) {
    // Create a pino instance for internal logging (Redis, etc.)
    const internalLogger = createLogger(config.LOG_LEVEL);
    const log: any = internalLogger;
    try {
      const { createClient } = await import('redis');
      const client = createClient({ url: config.REDIS_URL });
      client.on('error', (err: Error) => log.warn({ err }, 'Redis error'));
      // Add timeout to prevent hanging in tests/CI when Redis is unavailable
      const connectPromise = client.connect();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis connection timeout')), 3000)
      );
      await Promise.race([connectPromise, timeoutPromise]).catch((err: Error) => {
        log.warn({ err }, 'Redis connect failed or timed out — continuing without Redis');
        return null;
      });
      if (client.isOpen) {
        redis = client;
        log.info('Redis connected');
      }
    } catch (err) {
      log.warn({ err }, 'Redis not available — continuing without cache/queue');
    }
  }
  app.decorate('redis', redis);

  // Create a pino instance for internal logging (used by services)
  const internalLogger = createLogger(config.LOG_LEVEL);
  const log = internalLogger;

  // Lightweight db helper for services (drizzle wrapper)
  const db = opts.db ?? drizzle(pgPool);
  app.decorate('db', db);

  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  });

  await app.register(cookie);
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  });

  await app.register(authPlugin);

  // Global error handler — consistent envelope per DEVELOPMENT-RULES.md
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      request.log.warn({ err: error, code: error.code }, error.message);
      return reply.status(error.statusCode).send(toErrorEnvelope(error));
    }

    if ((error as any).validation) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: (error as any).message ?? 'Validation failed',
          details: (error as any).validation,
        },
      });
    }

    // Fastify JWT errors
    if ((error as any).statusCode === 401) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: (error as any).message ?? 'Unauthorized' },
      });
    }

    // Content-Type parser not found — Fastify returns 415 Unsupported Media Type when no parser
    // matches the request's Content-Type. For multipart this normally means @fastify/multipart
    // was not registered on this instance. Map to a clear error but don't break inject tests
    // that intentionally send multipart to routes that handle it.
    const maybeStatus = (error as any).statusCode;
    if (typeof maybeStatus === 'number' && maybeStatus === 415) {
      const ct = (request.headers['content-type'] as string | undefined) ?? '';
      // If this is a multipart request hitting a multipart route, the 415 is from missing parser
      // Try to surface a more helpful message; the global handler will otherwise show SYSTEM_ERROR
      if (ct.includes('multipart/form-data')) {
        return reply.status(415).send({
          success: false,
          error: {
            code: 'INVALID_FILE_TYPE',
            message: (error as Error).message ?? 'Multipart parser not configured',
          },
        });
      }
    }
    if (typeof maybeStatus === 'number' && maybeStatus >= 400 && maybeStatus < 600) {
      const msg: string = (error as Error).message ?? 'Request failed';
      return reply.status(maybeStatus).send({
        success: false,
        error: {
          code: (error as any).code === 'FST_REQ_FILE_TOO_LARGE' ? 'FILE_TOO_LARGE' : 'SYSTEM_ERROR',
          message: msg,
        },
      });
    }

    request.log.error({ err: error }, 'Unhandled error');
    const statusCode = (error as any).statusCode ?? 500;
    return reply.status(statusCode).send({
      success: false,
      error: {
        code: 'SYSTEM_ERROR',
        message: config.NODE_ENV === 'production' ? 'Internal server error' : (error as Error).message,
      },
    });
  });

  // ── Phase 2: Initialize core services ──

  // NineRouter Gateway
  const gateway = new NineRouterGateway({
    baseUrl: config.NINE_ROUTER_BASE_URL,
    apiKey: config.NINE_ROUTER_API_KEY,
    defaultModel: config.NINE_ROUTER_DEFAULT_MODEL,
    logger: internalLogger,
  });

  // Tool Registry
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(webSearchTool);
  toolRegistry.register(fetchUrlTool);

  // Agent Registry
  const agentRegistry = new AgentRegistry();

  // Run Logger
  const runLogger = new RunLogger(db, internalLogger);

  // Agent Service
  const agentService = new AgentService(agentRegistry, gateway, toolRegistry, internalLogger, runLogger);

  // Register concrete agents (Research, Strategist, Copywriter)
  registerConcreteAgents(agentRegistry, agentService, gateway, toolRegistry, internalLogger);

  // Execution Store
  const executionStore = new ExecutionStore(db, internalLogger);

  // Workflow Service
  const workflowService = new WorkflowService(executionStore, internalLogger);

  // BullMQ Queue (optional — degrades to in-process if Redis unavailable)
  const queue = await createWorkflowQueue(config.REDIS_URL, internalLogger, { isTestMode });

  // Workflow Engine
  const workflowEngine = new WorkflowEngine(
    executionStore,
    agentService,
    runLogger,
    queue,
    internalLogger,
  );

  // ── Phase 3: Materials ──
  let storage: ReturnType<typeof createStorageAdapter> | null = null;
  let materialsService: MaterialsService | null = null;
  let classificationService: ClassificationService | null = null;
  let sourcePacksService: SourcePacksService | null = null;
  try {
    storage = createStorageAdapter(config);
    classificationService = new ClassificationService({ db, agentService, storage, logger: internalLogger });
    materialsService = new MaterialsService({ db, storage, logger: internalLogger, config, classificationService });
    sourcePacksService = new SourcePacksService({ db, logger: internalLogger });
  } catch (err) {
    internalLogger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Materials storage init failed — routes will error until configured');
  }

  // Decorate app with service instances for route access
  (app as unknown as Record<string, unknown>)['gateway'] = gateway;
  (app as unknown as Record<string, unknown>)['toolRegistry'] = toolRegistry;
  (app as unknown as Record<string, unknown>)['agentRegistry'] = agentRegistry;
  (app as unknown as Record<string, unknown>)['agentService'] = agentService;
  (app as unknown as Record<string, unknown>)['runLogger'] = runLogger;
  (app as unknown as Record<string, unknown>)['executionStore'] = executionStore;
  (app as unknown as Record<string, unknown>)['workflowService'] = workflowService;
  (app as unknown as Record<string, unknown>)['workflowEngine'] = workflowEngine;
  if (storage) (app as unknown as Record<string, unknown>)['storage'] = storage;
  if (materialsService) (app as unknown as Record<string, unknown>)['materialsService'] = materialsService;
  if (classificationService) (app as unknown as Record<string, unknown>)['classificationService'] = classificationService;
  if (sourcePacksService) (app as unknown as Record<string, unknown>)['sourcePacksService'] = sourcePacksService;

  // ── Seed default workflow definition if not exists (skip in test mode) ──
  if (!isTestMode) {
    try {
      const existing = await db
        .select()
        .from(workflowDefinitions)
        .where(eq(workflowDefinitions.slug, 'content-production-v1'))
        .limit(1);
      if (existing.length === 0) {
        // Create the default linear workflow: research → strategist → copywriter
        await workflowService.createWorkflow({
          slug: 'content-production-v1',
          name: 'Content Production v1',
          version: '1.0.0',
          definition: {
            steps: [
              {
                id: 'research',
                agentId: 'research-agent',
                inputMapping: { type: 'fromWorkflowInput', path: '' },
                outputKey: 'research',
              },
              {
                id: 'strategist',
                agentId: 'content-strategist-agent',
                inputMapping: {
                  type: 'merge',
                  mappings: {
                    research: { type: 'fromStepOutput', stepId: 'research', path: '' },
                    contentCategory: { type: 'fromWorkflowInput', path: 'contentCategory' },
                    brandVoice: { type: 'fromWorkflowInput', path: 'brandVoice' },
                  },
                },
                outputKey: 'strategy',
              },
              {
                id: 'copywriter',
                agentId: 'copywriter-agent',
                inputMapping: {
                  type: 'merge',
                  mappings: {
                    strategy: { type: 'fromStepOutput', stepId: 'strategist', path: '' },
                    template: { type: 'fromWorkflowInput', path: 'template' },
                    tradingDna: { type: 'fromWorkflowInput', path: 'tradingDna' },
                  },
                },
                outputKey: 'copy',
              },
            ],
            edges: [
              { from: 'research', to: 'strategist' },
              { from: 'strategist', to: 'copywriter' },
            ],
            approvalGates: [], // No gates for happy path
          },
        });
        log.info('Seeded default workflow: content-production-v1');
      }
    } catch (err) {
      log.warn({ err }, 'Failed to seed default workflow (may already exist)');
    }
  }

  // Routes
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      // Phase 2 routes
      await api.register(agentsRoutes);
      await api.register(workflowsRoutes);
      await api.register(approvalsRoutes);
      await api.register(runsRoutes);
      await api.register(toolsRoutes);
      // Phase 3: materials + source packs
      await api.register(materialsRoutes);
      await api.register(sourcePacksRoutes);
    },
    { prefix: '/api' },
  );

  // Root — helpful for manual checks
  app.get('/', async () => ({
    success: true,
    data: { name: 'KantorKu-AI API', version: '0.0.1', docs: '/api/health' },
  }));

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: ReturnType<typeof loadConfig>;
    pgPool: ReturnType<typeof getPool>;
    redis: any;
    db: any;
  }
}