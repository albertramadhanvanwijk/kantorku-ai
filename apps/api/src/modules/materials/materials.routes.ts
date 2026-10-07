import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as shared from '@kantorku/shared';
import { materialTypeSchema } from '@kantorku/shared';
import type { MaterialsService } from './materials.service.js';
import type { StorageAdapter } from './storage/adapter.js';

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).optional(),
  type: materialTypeSchema.optional(),
  sourcePackId: z.string().uuid().optional(),
});

const patchBodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  type: materialTypeSchema.optional(),
  metadata: z.unknown().optional(),
});

function getMaterialsService(app: FastifyInstance): MaterialsService {
  const svc = (app as unknown as Record<string, unknown>)['materialsService'] as MaterialsService | undefined;
  if (!svc) throw new shared.AppError('SYSTEM_ERROR', 'MaterialsService not configured', 500);
  return svc;
}

function getStorage(app: FastifyInstance): StorageAdapter | undefined {
  return (app as unknown as Record<string, unknown>)['storage'] as StorageAdapter | undefined;
}

async function getSignedFileAsset(app: FastifyInstance, fileAsset: any): Promise<any> {
  const storage = getStorage(app);
  if (!storage || !fileAsset?.key) return fileAsset;
  try {
    const url = await storage.getSignedUrl(String(fileAsset.key));
    return { ...fileAsset, url };
  } catch {
    return fileAsset;
  }
}

export async function materialsRoutes(app: FastifyInstance): Promise<void> {
  // Register @fastify/multipart — must happen before route handlers so the parser is
  // available for 'multipart/form-data' before Fastify's 415 fallback fires.
  // Guard with app-level flag so multiple registrations don't collide in tests.
  let multipartReady = false;
  if ((app as any)._multipartRegistered) {
    multipartReady = true;
  } else {
    try {
      const multipartMod: any = await import('@fastify/multipart');
      const multipart = multipartMod.default ?? multipartMod;
      await app.register(multipart, {
        limits: {
          fileSize: (app.config?.MAX_UPLOAD_MB ?? 25) * 1024 * 1024,
        },
      });
      (app as any)._multipartRegistered = true;
      multipartReady = true;
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (msg.includes('already') || msg.includes('decorator') || msg.includes('already registered')) {
        multipartReady = true;
        (app as any)._multipartRegistered = true;
      } else {
        // eslint-disable-next-line no-console
        console.warn('[materialsRoutes] failed to register @fastify/multipart', err);
      }
    }
  }

  // POST /api/materials/upload — multipart
  app.post('/materials/upload', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getMaterialsService(app);
    const userId = (request.user as { sub: string }).sub;

    let fileBuffer: Buffer | null = null;
    let originalName = 'file';
    let mimeType = 'application/octet-stream';
    let title: string | undefined;
    let type: string | undefined;
    let sourcePackId: string | undefined;

    // Try Fastify multipart — prefer it when available
    const reqAny = request as any;
    const hasMultipart = typeof reqAny.file === 'function' && multipartReady;
    const contentType: string = String(request.headers['content-type'] ?? '');
    const isMultipart = contentType.includes('multipart/form-data');

    if (hasMultipart && isMultipart) {
      // Use @fastify/multipart parsing: iterate parts to get file + fields
      let filePart: any = null;
      const fields: Record<string, string> = {};
      try {
        // Try single file() first
        const maybePart = await reqAny.file();
        if (maybePart) {
          filePart = maybePart;
          // Collect other fields via parts() if available, else via filePart.fields
          const rawFields: Record<string, any> = (maybePart as any).fields ?? {};
          for (const [k, v] of Object.entries(rawFields)) {
            if (typeof v === 'string') fields[k] = v;
            else if (v && typeof (v as any).value === 'string') fields[k] = (v as any).value;
          }
          // Also iterate remaining parts if multipart had multiple fields before file
          if (typeof reqAny.parts === 'function') {
            // We already consumed one part; remaining parts loop may be needed for fields that came before file
            // Instead, also check request.body if available
          }
        }
      } catch (e: any) {
        // @fastify/multipart throws FST_INVALID_MULTIPART_CONTENT or fileSize limit
        const code = e?.code ?? e?.statusCode;
        const msg = e?.message ?? String(e);
        if (String(code) === 'FST_REQ_FILE_TOO_LARGE' || msg.includes('File too large') || msg.includes('fileSize')) {
          throw shared.fileTooLarge(msg, { cause: msg });
        }
        // If no file part, fall through to fallback
      }

      if (filePart) {
        originalName = filePart.filename ?? originalName;
        mimeType = filePart.mimetype ?? mimeType;
        const chunks: Buffer[] = [];
        for await (const chunk of filePart.file) {
          chunks.push(chunk as Buffer);
        }
        fileBuffer = Buffer.concat(chunks);
        title = fields['title'] ?? title;
        type = fields['type'] ?? type;
        sourcePackId = fields['sourcePackId'] ?? sourcePackId;
      } else {
        // No file part found via multipart — will fall through to error below
      }

      // Fallback: also check if multipart fields were parsed into request.body
      if (!fileBuffer && (request.body as any)?.file) {
        // filled below
      } else if (fileBuffer) {
        // we have buffer, skip fallback
      } else {
        // Try to parse via parts() iteration as alternative
        if (typeof reqAny.parts === 'function' && !fileBuffer) {
          try {
            for await (const part of reqAny.parts()) {
              if ((part as any).file) {
                originalName = (part as any).filename ?? originalName;
                mimeType = (part as any).mimetype ?? mimeType;
                const chunks: Buffer[] = [];
                for await (const chunk of (part as any).file) chunks.push(chunk as Buffer);
                fileBuffer = Buffer.concat(chunks);
              } else if ((part as any).fieldname) {
                const k = (part as any).fieldname as string;
                const v = (part as any).value as string;
                if (k === 'title') title = v;
                else if (k === 'type') type = v;
                else if (k === 'sourcePackId') sourcePackId = v;
              }
            }
          } catch {}
        }
      }
    }

    // Fallback for non-multipart or test injection: body contains file as Buffer/object
    if (!fileBuffer) {
      const bodyAny: any = (request.body as any);
      if (bodyAny && bodyAny.file !== undefined) {
        // Test injection fallback: body contains { file: { buffer, filename, mimetype }, title, type }
        const body: any = request.body;
        const f = body.file;
        if (Buffer.isBuffer(f)) {
          fileBuffer = f;
        } else if (f?.buffer && Buffer.isBuffer(f.buffer)) {
          fileBuffer = f.buffer;
          originalName = f.filename ?? originalName;
          mimeType = f.mimetype ?? mimeType;
        } else if (typeof f === 'object' && f.data) {
          fileBuffer = Buffer.from(f.data);
          originalName = f.filename ?? originalName;
          mimeType = f.mimetype ?? mimeType;
        }
        title = body.title ?? title;
        type = body.type ?? type;
        sourcePackId = body.sourcePackId ?? sourcePackId;
        originalName = body.originalName ?? body.filename ?? originalName;
        mimeType = body.mimeType ?? body.mimetype ?? mimeType;
      } else {
        throw shared.validationError('Missing file field');
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      throw shared.validationError('File is empty');
    }

    // Validate optional type via Zod if provided
    let normalizedType: any | undefined;
    if (type !== undefined && String(type).trim() !== '') {
      const t = String(type).trim();
      const parsed = materialTypeSchema.safeParse(t);
      if (!parsed.success) {
        throw shared.invalidFileType(`Invalid material type: ${t}`, { type: t });
      }
      normalizedType = parsed.data;
    }

    // Validate sourcePackId is uuid if provided
    if (sourcePackId !== undefined && String(sourcePackId).trim() !== '') {
      const s = String(sourcePackId).trim();
      if (!z.string().uuid().safeParse(s).success) {
        throw shared.validationError('Invalid sourcePackId: must be UUID', { sourcePackId: s });
      }
      sourcePackId = s;
    } else {
      sourcePackId = undefined;
    }

    const result = await svc.upload(fileBuffer, {
      originalName: String(originalName),
      mimeType: String(mimeType),
      sizeBytes: fileBuffer.length,
      userId,
      title: title ? String(title) : undefined,
      type: normalizedType,
      sourcePackId,
    });

    const signedAsset = await getSignedFileAsset(app, result.fileAsset);

    return reply.status(200).send({
      success: true,
      data: {
        material: result.material,
        fileAsset: signedAsset,
      },
    });
  });

  // GET /api/materials — paginated list
  app.get('/materials', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getMaterialsService(app);
    const userId = (request.user as { sub: string }).sub;
    const parsed = paginationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw shared.validationError('Invalid query', { issues: parsed.error.issues });
    }
    const { page, pageSize, type, sourcePackId } = parsed.data;
    const res = await svc.list({
      userId,
      type: type as any,
      sourcePackId,
      page: page ?? 1,
      pageSize: pageSize ?? 20,
    });

    // Attach signed URLs to each row's fileAsset if present
    const storage = getStorage(app);
    const rows = await Promise.all(
      res.rows.map(async (r: any) => {
        if (r.fileAsset && storage) {
          return { ...r, fileAsset: await getSignedFileAsset(app, r.fileAsset) };
        }
        return r;
      }),
    );

    return reply.send({
      success: true,
      data: { rows, total: res.total, page: page ?? 1, pageSize: pageSize ?? 20 },
    });
  });

  // GET /api/materials/:id
  app.get('/materials/:id', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getMaterialsService(app);
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing material id');
    const material = await svc.getById(id, userId);
    const signed = material.fileAsset ? await getSignedFileAsset(app, material.fileAsset) : material.fileAsset;
    const out = signed ? { ...material, fileAsset: signed } : material;
    return reply.send({ success: true, data: out });
  });

  // PATCH /api/materials/:id
  app.patch('/materials/:id', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getMaterialsService(app);
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing material id');
    const parsed = patchBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw shared.validationError('Invalid body', { issues: parsed.error.issues });
    }
    const updated = await svc.update(id, userId, parsed.data as any);
    const signed = updated.fileAsset ? await getSignedFileAsset(app, updated.fileAsset) : updated.fileAsset;
    const out = signed ? { ...updated, fileAsset: signed } : updated;
    return reply.send({ success: true, data: out });
  });

  // DELETE /api/materials/:id
  app.delete('/materials/:id', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const svc = getMaterialsService(app);
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing material id');
    await svc.delete(id, userId);
    return reply.status(200).send({ success: true, data: { id } });
  });
}
