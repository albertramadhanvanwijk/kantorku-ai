import { describe, it, expect } from 'vitest';
import { budgetExceeded, timeoutError, approvalRequired } from './errors.js';

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
