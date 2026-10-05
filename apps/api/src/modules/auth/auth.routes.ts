import type { FastifyInstance } from 'fastify';
import { loginSchema, registerSchema } from '@kantorku/shared';
import { authenticateUser, getUserById, registerUser } from './auth.service.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const user = await registerUser(app.db, app.config, parsed.data);

    const token = app.jwt.sign({ sub: user.id, email: user.email });

    return reply.status(201).send({
      success: true,
      data: { user, token },
    });
  });

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const user = await authenticateUser(app.db, parsed.data);
    const token = app.jwt.sign({ sub: user.id, email: user.email });

    return reply.send({
      success: true,
      data: { user, token },
    });
  });

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await getUserById(app.db, request.user.sub);
    return reply.send({ success: true, data: { user } });
  });
}
