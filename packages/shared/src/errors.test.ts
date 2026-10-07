import { describe, it, expect } from 'vitest';
import {
  budgetExceeded,
  timeoutError,
  approvalRequired,
  fileTooLarge,
  invalidFileType,
  storageError,
  checksumMismatch,
  materialNotFound,
  sourcePackNotFound,
  extractionFailed,
} from './errors.js';

describe('Phase 2 error helpers', () => {
  it('budgetExceeded returns BUDGET_EXCEEDED with 402', () => {
    const e = budgetExceeded('over budget');
    expect(e.code).toBe('BUDGET_EXCEEDED');
    expect(e.statusCode).toBe(402);
    expect(e.message).toBe('over budget');
  });

  it('budgetExceeded passes details', () => {
    const e = budgetExceeded('over', { cost: 1 });
    expect(e.details).toEqual({ cost: 1 });
  });

  it('timeoutError returns TIMEOUT with 504', () => {
    const e = timeoutError('timed out');
    expect(e.code).toBe('TIMEOUT');
    expect(e.statusCode).toBe(504);
  });

  it('approvalRequired returns APPROVAL_REQUIRED with 409', () => {
    const e = approvalRequired('needs approval');
    expect(e.code).toBe('APPROVAL_REQUIRED');
    expect(e.statusCode).toBe(409);
  });
});

describe('Phase 3 error helpers', () => {
  it('fileTooLarge returns FILE_TOO_LARGE with 413', () => {
    const e = fileTooLarge('too large');
    expect(e.code).toBe('FILE_TOO_LARGE');
    expect(e.statusCode).toBe(413);
  });
  it('fileTooLarge passes details', () => {
    const e = fileTooLarge('too large', { maxMb: 25 });
    expect(e.details).toEqual({ maxMb: 25 });
  });
  it('invalidFileType returns INVALID_FILE_TYPE with 415', () => {
    const e = invalidFileType('bad type');
    expect(e.code).toBe('INVALID_FILE_TYPE');
    expect(e.statusCode).toBe(415);
  });
  it('storageError returns STORAGE_ERROR with 500', () => {
    const e = storageError('store fail');
    expect(e.code).toBe('STORAGE_ERROR');
    expect(e.statusCode).toBe(500);
  });
  it('checksumMismatch returns CHECKSUM_MISMATCH with 400', () => {
    const e = checksumMismatch('mismatch');
    expect(e.code).toBe('CHECKSUM_MISMATCH');
    expect(e.statusCode).toBe(400);
  });
  it('materialNotFound returns MATERIAL_NOT_FOUND with 404', () => {
    const e = materialNotFound();
    expect(e.code).toBe('MATERIAL_NOT_FOUND');
    expect(e.statusCode).toBe(404);
  });
  it('materialNotFound uses custom message', () => {
    const e = materialNotFound('custom');
    expect(e.message).toBe('custom');
  });
  it('sourcePackNotFound returns SOURCE_PACK_NOT_FOUND with 404', () => {
    const e = sourcePackNotFound();
    expect(e.code).toBe('SOURCE_PACK_NOT_FOUND');
    expect(e.statusCode).toBe(404);
  });
  it('extractionFailed returns EXTRACTION_FAILED with 500', () => {
    const e = extractionFailed('extract fail');
    expect(e.code).toBe('EXTRACTION_FAILED');
    expect(e.statusCode).toBe(500);
  });
  it('extractionFailed passes details', () => {
    const e = extractionFailed('fail', { cause: 'timeout' });
    expect(e.details).toEqual({ cause: 'timeout' });
  });
});
