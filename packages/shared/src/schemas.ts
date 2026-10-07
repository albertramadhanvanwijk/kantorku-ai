import { z } from 'zod';

// Common envelopes
export const successEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    data,
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

// Auth
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// Phase 3: Source Room
export const materialTypeSchema = z.enum([
  'chart',
  'trade_screenshot',
  'text_note',
  'news',
  'promo_asset',
  'logo',
  'document',
]);
export type MaterialType = z.infer<typeof materialTypeSchema>;

export const createMaterialSchema = z.object({
  type: materialTypeSchema.optional(),
  title: z.string().min(1).max(500).optional(),
  sourcePackId: z.string().uuid().optional(),
});

export const updateMaterialSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  type: materialTypeSchema.optional(),
  metadata: z.unknown().optional(),
});

export const createSourcePackSchema = z.object({
  name: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  materialIds: z.array(z.string().uuid()).optional(),
});

export const updateSourcePackSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
});

// Health
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  timestamp: z.string(),
});
