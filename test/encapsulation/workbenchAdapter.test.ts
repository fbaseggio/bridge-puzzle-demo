import { describe, expect, it } from 'vitest';
import { bindStandard } from '../../src/encapsulation';
import { init } from '../../src/core';
import { listEncapsulationWorkbenchEntries, loadEncapsulationWorkbenchProblem } from '../../src/encapsulation/workbenchProblems';

describe('encapsulation workbench adapter', () => {
  it("maps goal using finalHandSize + goalOffset for WLa, WB > b', W -1", () => {
    const bound = bindStandard("WLa, WB > b', W -1");
    const problem = loadEncapsulationWorkbenchProblem('encap_wla_wb_gt_b_w');
    expect(problem.goal.type).toBe('minTricks');
    expect(problem.goal.side).toBe('NS');
    expect(problem.goal.n).toBe(bound.metadata.finalHandSize - 1);
  });

  it('exports bound threat cards into concrete problem threatCardIds', () => {
    const problem = loadEncapsulationWorkbenchProblem('encap_wa_a_gt_w');
    expect(problem.threatCardIds && problem.threatCardIds.length > 0).toBe(true);
    expect(problem.threatCardIds).toContain('SJ');
    expect(problem.threatCardIds).toContain('HK');
    expect(problem.policies.E?.kind).toBe('threatAware');
    expect(problem.policies.W?.kind).toBe('threatAware');
  });

  it('binds/adapts all newly added encapsulations without throwing', () => {
    const expectedNewIds = [
      'encap_la_eq_lb_w',
      'encap_wa_gt_b_wl',
      'encap_wla_w_eq_b',
      'encap_a_wc_gt_a_w',
      'encap_wa_ww_gt_wlc_wc',
      'encap_wa_wb_gt_wc_ww'
    ];
    const entries = listEncapsulationWorkbenchEntries();
    for (const id of expectedNewIds) {
      expect(entries.some((e) => e.id === id)).toBe(true);
      const problem = loadEncapsulationWorkbenchProblem(id);
      expect(problem.id).toBe(id);
      expect(() => init(problem)).not.toThrow();
    }
  });
});
