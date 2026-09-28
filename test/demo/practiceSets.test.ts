import { describe, expect, it } from 'vitest';
import { listEncapsulationWorkbenchEntries } from '../../src/encapsulation/workbenchProblems';
import { buildPracticeQueue, practiceSetFromSearch, PRACTICE_SET_OPTIONS } from '../../src/demo/practiceSets';

describe('practice set queue builder', () => {
  it('resolves shareable set links and defaults safely for missing or unknown sets', () => {
    for (const { id } of PRACTICE_SET_OPTIONS) {
      expect(practiceSetFromSearch(`?set=${id.slice(3)}`)).toBe(id);
      expect(practiceSetFromSearch(`?set=${id}&other=value`)).toBe(id);
    }
    for (const search of ['', '?set=', '?set=6', '?set=unknown', '?other=5']) {
      expect(practiceSetFromSearch(search)).toBe('set1');
    }
    const queue = buildPracticeQueue(practiceSetFromSearch('?set=5'));
    expect(queue).toHaveLength(5);
    expect(queue[0].id).toBe('encap_clash_wla_gt_wa_lc_ww__standard');
  });

  it('offers Clash Squeezes in the reviewed 3, 4, 5, 2, 1 order across sessions', () => {
    expect(PRACTICE_SET_OPTIONS).toContainEqual({ id: 'set5', label: 'Set 5 — Clash Squeezes' });
    const expectedIds = [
      'encap_clash_wla_gt_wa_lc_ww', 'encap_moon_double_clash_3', 'encap_moon_double_clash_5',
      'encap_moon_double_clash_7', 'encap_moon_hex_clash_2'
    ];
    const registry = new Map(listEncapsulationWorkbenchEntries().map((entry) => [entry.id, entry]));
    expect(expectedIds.map((id) => registry.get(id)?.encapsulation)).toEqual([
      'wLa > wA, Lc, WW', 'Wa, Lc > wA, Ww', 'WLa, wB > wc, WL',
      "[schd] wa, Ww > wA', Wci", "[schd] wA' Ww > WLc, c"
    ]);
    for (const seed of [1, 42, 999]) {
      const queue = buildPracticeQueue('set5', { seed });
      expect(queue.map((entry) => entry.id)).toEqual(expectedIds.map((id) => `${id}__standard`));
      expect(queue.map((entry) => entry.problem.goal.n)).toEqual([7, 6, 7, 6, 6]);
      expect(queue.map((entry) => entry.problem.source?.title)).toEqual([
        undefined, 'Moon Double Clash 3', 'Moon Double Clash 5', 'Moon Double Clash 7', 'Moon hex clash 2'
      ]);
      expect(queue[4].label).toBe('Type R Clash-B');
      expect(queue.every((entry) => entry.source === 'encapsulation-standard' && entry.problem.leader === 'S' && entry.problem.contract.strain === 'NT')).toBe(true);
    }
  });

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
