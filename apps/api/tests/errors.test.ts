import { describe, it, expect } from 'vitest';
import { AppError, toErrorEnvelope, validationError, unauthorized } from '@kantorku/shared';

describe('errors', () => {
  it('AppError has correct fields', () => {
    const err = new AppError('NOT_FOUND', 'missing', 404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
  });

  it('toErrorEnvelope shapes correctly', () => {
    const err = validationError('bad input', { field: 'email' });
    const env = toErrorEnvelope(err);
    expect(env.success).toBe(false);
    expect(env.error.code).toBe('VALIDATION_ERROR');
    expect(env.error.details).toEqual({ field: 'email' });
  });

  it('unauthorized helper', () => {
    const err = unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });
});
