import { describe, expect, it } from 'vitest';
import { bindStandard } from '../../src/encapsulation';
import { loadEncapsulationWorkbenchProblem } from '../../src/encapsulation/workbenchProblems';

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
});
