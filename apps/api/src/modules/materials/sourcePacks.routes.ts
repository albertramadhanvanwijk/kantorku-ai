import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as shared from '@kantorku/shared';
import { createSourcePackSchema, updateSourcePackSchema } from '@kantorku/shared';
import type { SourcePacksService } from './sourcePacks.service.js';

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

const addItemsBodySchema = z.object({
  materialIds: z.array(z.string().uuid()).min(1),
  sortOrder: z.number().int().min(0).optional(),
});

const reorderBodySchema = z.object({
  order: z
    .array(
      z.object({
        materialId: z.string().uuid(),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1),
  // Also support direct array payload per plan spec: { materialId, sortOrder }[]
});

const reorderDirectArraySchema = z.array(
  z.object({
    materialId: z.string().uuid(),
    sortOrder: z.number().int().min(0),
  }),
);

function getSourcePacksService(app: FastifyInstance): SourcePacksService {
  const svc = (app as unknown as Record<string, unknown>)['sourcePacksService'] as SourcePacksService | undefined;
  if (!svc) throw new shared.AppError('SYSTEM_ERROR', 'SourcePacksService not configured', 500);
  return svc;
}

export async function sourcePacksRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/source-packs
  app.post('/source-packs', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getSourcePacksService(app);
    const userId = (request.user as { sub: string }).sub;
    const parsed = createSourcePackSchema.safeParse(request.body);
    if (!parsed.success) {
      throw shared.validationError('Invalid body', { issues: parsed.error.issues });
    }
    const pack = await svc.create({
      name: parsed.data.name,
      description: parsed.data.description,
      materialIds: parsed.data.materialIds,
      userId,
    });
    return reply.status(201).send({ success: true, data: pack });
  });

  // GET /api/source-packs
  app.get('/source-packs', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getSourcePacksService(app);
    const userId = (request.user as { sub: string }).sub;
    const parsed = paginationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw shared.validationError('Invalid query', { issues: parsed.error.issues });
    }
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? 20;
    const res = await svc.list({ userId, page, pageSize });
    return reply.send({ success: true, data: { rows: res.rows, total: res.total, page, pageSize } });
  });

  // GET /api/source-packs/:id
  app.get('/source-packs/:id', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getSourcePacksService(app);
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing pack id');
    const pack = await svc.getById(id, userId);
    return reply.send({ success: true, data: pack });
  });

  // PATCH /api/source-packs/:id
  app.patch('/source-packs/:id', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getSourcePacksService(app);
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing pack id');
    const parsed = updateSourcePackSchema.safeParse(request.body);
    if (!parsed.success) {
      throw shared.validationError('Invalid body', { issues: parsed.error.issues });
    }
    const updated = await svc.update(id, userId, parsed.data as { name?: string; description?: string });
    return reply.send({ success: true, data: updated });
  });

  // DELETE /api/source-packs/:id
  app.delete('/source-packs/:id', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getSourcePacksService(app);
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing pack id');
    await svc.delete(id, userId);
    return reply.send({ success: true, data: { id } });
  });

  // POST /api/source-packs/:id/items
  app.post('/source-packs/:id/items', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getSourcePacksService(app);
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing pack id');
    const parsed = addItemsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw shared.validationError('Invalid body', { issues: parsed.error.issues });
    }
    const pack = await svc.addItems(id, userId, parsed.data.materialIds, parsed.data.sortOrder);
    return reply.send({ success: true, data: pack });
  });

  // DELETE /api/source-packs/:id/items/:materialId
  app.delete('/source-packs/:id/items/:materialId', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getSourcePacksService(app);
    const userId = (request.user as { sub: string }).sub;
    const { id, materialId } = request.params as { id: string; materialId: string };
    if (!id) throw shared.validationError('Missing pack id');
    if (!materialId) throw shared.validationError('Missing materialId');
    // Light Zod check
    const midCheck = z.string().uuid().safeParse(materialId);
    if (!midCheck.success) throw shared.validationError('Invalid materialId', { issues: midCheck.error.issues });
    await svc.removeItem(id, userId, materialId);
    return reply.send({ success: true, data: { id, materialId } });
  });

  // PATCH /api/source-packs/:id/items/reorder
  app.patch('/source-packs/:id/items/reorder', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getSourcePacksService(app);
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing pack id');
    const body: unknown = request.body;

    // Accept either { order: [...] } or direct array [...]
    let order: Array<{ materialId: string; sortOrder: number }>;
    if (Array.isArray(body)) {
      const parsed = reorderDirectArraySchema.safeParse(body);
      if (!parsed.success) throw shared.validationError('Invalid body', { issues: parsed.error.issues });
      order = parsed.data;
    } else if (body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>)['order'])) {
      const parsed = reorderBodySchema.safeParse(body);
      if (!parsed.success) throw shared.validationError('Invalid body', { issues: parsed.error.issues });
      order = parsed.data.order;
    } else if (body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>)['items'])) {
      // Alternative shape: { items: [{ materialId, sortOrder }] }
      const items = (body as Record<string, unknown>)['items'] as unknown;
      const parsed = reorderDirectArraySchema.safeParse(items);
      if (!parsed.success) throw shared.validationError('Invalid body', { issues: parsed.error.issues });
      order = parsed.data;
    } else {
      // Try direct object with order key required; if missing, error
      const parsed = reorderBodySchema.safeParse(body);
      if (!parsed.success) throw shared.validationError('Invalid body', { issues: parsed.error.issues });
      order = parsed.data.order;
    }

    const pack = await svc.reorder(id, userId, order);
    return reply.send({ success: true, data: pack });
  });
}
