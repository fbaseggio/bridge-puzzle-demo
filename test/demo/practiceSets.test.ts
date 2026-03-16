import { describe, expect, it } from 'vitest';
import { listEncapsulationWorkbenchEntries } from '../../src/encapsulation/workbenchProblems';
import { buildPracticeQueue } from '../../src/demo/practiceSets';

describe('practice set queue builder', () => {
  it('builds non-empty set1 queue', () => {
    const queue = buildPracticeQueue('set1', { seed: 1 });
    expect(queue.length).toBeGreaterThan(0);
  });

  it('builds set2 as 2x encapsulation entries with standard/random variants', () => {
    const encCount = listEncapsulationWorkbenchEntries().length;
    const queue = buildPracticeQueue('set2', { seed: 2 });
    expect(queue.length).toBe(encCount * 2);
    const standard = queue.filter((q) => q.source === 'encapsulation-standard');
    const random = queue.filter((q) => q.source === 'encapsulation-random');
    expect(standard.length).toBe(encCount);
    expect(random.length).toBe(encCount);
    expect(queue.every((q) => q.problem && typeof q.problem.id === 'string')).toBe(true);
    expect(queue.some((q) => q.id.endsWith('__standard'))).toBe(true);
    expect(queue.some((q) => q.id.endsWith('__random'))).toBe(true);
  });

  it('materializes stable concrete problems for a session queue', () => {
    const queue = buildPracticeQueue('set2', { seed: 42 });
    const first = queue[0];
    expect(first.problem.id).toBe(first.id);
    expect(first.problem.hands.N).toBeDefined();
    expect(first.problem.hands.E).toBeDefined();
    expect(first.problem.hands.S).toBeDefined();
    expect(first.problem.hands.W).toBeDefined();
  });
});

