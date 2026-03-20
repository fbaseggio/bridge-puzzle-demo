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

  it('builds set3 with all double-squeeze targets', () => {
    const queue = buildPracticeQueue('set3', { seed: 7 });
    expect(queue.length).toBe(5);
    const ids = new Set(queue.map((q) => q.id));
    expect(ids.has('p003')).toBe(true);
    expect(ids.has('p008')).toBe(true);
    expect(ids.has('encap_wwc_gt_a_b_w__standard')).toBe(true);
    expect(ids.has('encap_a_wc_gt_a_w__standard')).toBe(true);
    expect(ids.has('encap_wa_wb_gt_wc_ww__standard')).toBe(true);
  });

  it('builds set4 with all compound-squeeze encapsulations', () => {
    const queue = buildPracticeQueue('set4', { seed: 11 });
    expect(queue.length).toBe(11);
    const ids = new Set(queue.map((q) => q.id));
    expect(ids.has('encap_a_wc_gt_wwc_ww__standard')).toBe(true);
    expect(ids.has('encap_wwa_ww_gt_wc_wc__standard')).toBe(true);
    expect(ids.has('encap_wa_ww_gt_wlc_wc_b__standard')).toBe(true);
    expect(ids.has('encap_wa_ww_alt_gt_wc_wc__standard')).toBe(true);
    expect(ids.has('encap_a_ww_gt_wlc_wc__standard')).toBe(true);
    expect(ids.has('encap_wa_ww_gt_wc_wc_b__standard')).toBe(true);
    expect(ids.has('encap_wla_wc_gt_wc_ww__standard')).toBe(true);
    expect(ids.has('encap_wa_wlc_gt_wc_ww__standard')).toBe(true);
    expect(ids.has('encap_la_wc_gt_wlc_ww__standard')).toBe(true);
    expect(ids.has('encap_a_wlc_gt_wlc_ww__standard')).toBe(true);
    expect(ids.has('encap_wwa_wc_gt_wc_ww__standard')).toBe(true);
  });
});
