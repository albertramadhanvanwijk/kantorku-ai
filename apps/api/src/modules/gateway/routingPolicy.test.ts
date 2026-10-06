import { describe, it, expect } from 'vitest';
import { selectModel } from './routingPolicy.js';

describe('routingPolicy', () => {
  it('selects preferred model for research', () => {
    expect(selectModel('research')).toBe('mid-research-v1');
  });

  it('filters by requiredCapabilities', () => {
    expect(selectModel('research', { requiredCapabilities: ['vision'] })).toMatch(/vision/);
  });

  it('throws BUDGET_EXCEEDED when cheapest exceeds budget', () => {
    expect(() => selectModel('qa', { maxCostPerRunUsd: 0.0001 })).toThrow(/BUDGET_EXCEEDED/);
  });
});
