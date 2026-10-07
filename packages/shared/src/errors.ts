export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'WORKFLOW_ERROR'
  | 'SYSTEM_ERROR'
  | 'BUDGET_EXCEEDED'
  | 'TIMEOUT'
  | 'APPROVAL_REQUIRED'
  | 'FILE_TOO_LARGE'
  | 'INVALID_FILE_TYPE'
  | 'STORAGE_ERROR'
  | 'CHECKSUM_MISMATCH'
  | 'MATERIAL_NOT_FOUND'
  | 'SOURCE_PACK_NOT_FOUND'
  | 'EXTRACTION_FAILED';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: ErrorCode, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function validationError(message: string, details?: unknown): AppError {
  return new AppError('VALIDATION_ERROR', message, 400, details);
}

export function unauthorized(message = 'Unauthorized'): AppError {
  return new AppError('UNAUTHORIZED', message, 401);
}

export function forbidden(message = 'Forbidden'): AppError {
  return new AppError('FORBIDDEN', message, 403);
}

export function notFound(message = 'Not found'): AppError {
  return new AppError('NOT_FOUND', message, 404);
}

export function conflict(message: string): AppError {
  return new AppError('CONFLICT', message, 409);
}

export function budgetExceeded(message: string, details?: unknown): AppError {
  return new AppError('BUDGET_EXCEEDED', message, 402, details);
}

export function timeoutError(message: string, details?: unknown): AppError {
  return new AppError('TIMEOUT', message, 504, details);
}

export function approvalRequired(message: string, details?: unknown): AppError {
  return new AppError('APPROVAL_REQUIRED', message, 409, details);
}

export function fileTooLarge(message: string, details?: unknown): AppError {
  return new AppError('FILE_TOO_LARGE', message, 413, details);
}

export function invalidFileType(message: string, details?: unknown): AppError {
  return new AppError('INVALID_FILE_TYPE', message, 415, details);
}

export function storageError(message: string, details?: unknown): AppError {
  return new AppError('STORAGE_ERROR', message, 500, details);
}

export function checksumMismatch(message: string, details?: unknown): AppError {
  return new AppError('CHECKSUM_MISMATCH', message, 400, details);
}

export function materialNotFound(message = 'Material not found'): AppError {
  return new AppError('MATERIAL_NOT_FOUND', message, 404);
}

export function sourcePackNotFound(message = 'Source pack not found'): AppError {
  return new AppError('SOURCE_PACK_NOT_FOUND', message, 404);
}

export function extractionFailed(message: string, details?: unknown): AppError {
  return new AppError('EXTRACTION_FAILED', message, 500, details);
}

export type ErrorEnvelope = {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
};

export function toErrorEnvelope(err: AppError): ErrorEnvelope {
  return {
    success: false,
    error: {
      code: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    },
  };
}
