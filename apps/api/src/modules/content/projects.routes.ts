import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as shared from '@kantorku/shared';
import type { ContentProjectsService, ProcessingMode } from './projects.service.js';
import { processingModeSchema } from './projects.service.js';

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

const createProjectBodySchema = z.object({
  sourcePackId: z.string().uuid(),
  mode: processingModeSchema,
  brief: z.string().max(5000).optional(),
});

function getContentProjectsService(app: FastifyInstance): ContentProjectsService {
  const svc = (app as unknown as Record<string, unknown>)['contentProjectsService'] as ContentProjectsService | undefined;
  if (!svc) throw new shared.AppError('SYSTEM_ERROR', 'ContentProjectsService not configured', 500);
  return svc;
}

export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/content-projects — create project with mode
  app.post('/content-projects', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getContentProjectsService(app);
    const userId = (request.user as { sub: string }).sub;

    const parsed = createProjectBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw shared.validationError('Invalid body', { issues: parsed.error.issues });
    }

    const { sourcePackId, mode, brief } = parsed.data;
    const result = await svc.create({
      sourcePackId,
      mode: mode as ProcessingMode,
      brief,
      userId,
    });

    return reply.status(201).send({
      success: true,
      data: {
        project: result.project,
        execution: result.execution,
      },
    });
  });

  // GET /api/content-projects — paginated list, ownership-scoped
  app.get('/content-projects', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getContentProjectsService(app);
    const userId = (request.user as { sub: string }).sub;

    const parsed = paginationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw shared.validationError('Invalid query', { issues: parsed.error.issues });
    }

    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? 20;

    const res = await svc.list({ userId, page, pageSize });
    return reply.send({
      success: true,
      data: { rows: res.rows, total: res.total, page, pageSize },
    });
  });

  // GET /api/content-projects/:id — ownership-scoped
  app.get('/content-projects/:id', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getContentProjectsService(app);
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing project id');
    const project = await svc.getById(id, userId);
    return reply.send({ success: true, data: project });
  });
}
