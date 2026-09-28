import { describe, expect, it } from 'vitest';
import { bindStandard, deriveBoundThreatCards, deriveInverseThreatCards, explainPositionInverse } from '../../src/encapsulation';
import { buildEncapsulationWorkbenchProblem, listEncapsulationWorkbenchEntries } from '../../src/encapsulation/workbenchProblems';
import { allThreats, initClassification, stoppingDefenders, updateClassificationAfterPlay } from '../../src/ai/threatModel';
import { apply, init, legalPlays, type Seat } from '../../src/core';
import { buildPracticeQueue } from '../../src/demo/practiceSets';
import { getCardRankColor } from '../../src/ui/annotations';
import { computeDiscardTiers } from '../../src/ai/defenderDiscard';
import { buildFeatureStateFromClassification, diffFeatureStates } from '../../src/ai/features';
import { renderOnboardingReport, runOnboarding } from '../../tools/onboarding';

const cases = [
  ['A', 'c', ['E', 'W']], ["A'", 'a', ['W']], ['A*', 'b', ['E']],
  ['B', 'c', ['E', 'W']], ["B'", 'b', ['E']], ['B*', 'a', ['W']],
  ['C', 'c', ['E', 'W']]
] as const;

function problem(encapsulation: string) {
  return buildEncapsulationWorkbenchProblem({ id: 'companion-test', name: 'Companion test', encapsulation });
}

describe('capital companion threats', () => {
  for (const primary of ['N', 'S'] as const) {
    for (const [symbol, companionSymbol, northStoppers] of cases) {
      it(`${primary}-primary ${symbol} includes the opposite threat and correct stoppers`, () => {
        const encap = primary === 'N' ? `W${symbol} =` : `= W${symbol}`;
        const bound = bindStandard(encap);
        const p = problem(encap);
        const companion = deriveBoundThreatCards(bound).find((card) => card.seat === primary)!;
        const c = initClassification({ hands: p.hands }, p.threatCardIds!, [], undefined, p.threatSymbolByCardId);
        const threats = allThreats(c.threat);
        const low = threats.find((threat) => threat.threatCardId === companion.cardId)!;
        expect(threats).toHaveLength(2);
        expect(companion.symbol).toBe(companionSymbol);
        const stoppers = primary === 'N' ? [...northStoppers] : northStoppers.map((seat) => seat === 'E' ? 'W' : 'E');
        expect(stoppingDefenders(low, { hands: p.hands }).sort()).toEqual(stoppers.sort());
        expect(c.perCardRole[low.threatCardId]).toBe('threat');
        expect(getCardRankColor(low.threatCardId, c.threat, c.labels, true)).toBe('green');
        expect(p.hands).toEqual(bound.hands);
      });
    }
  }

  it('keeps both heart threats and their distinct guard obligations in Moon Double Clash 5', () => {
    const p = buildPracticeQueue('set5')[2].problem;
    expect(p.threatCardIds).toEqual(['S9', 'HJ', 'D9', 'H2']);
    const state = init(p);
    expect(state.cardRoles.HJ).toBe('threat');
    expect(state.cardRoles.H2).toBe('threat');
    expect(state.threatLabels!.E.busy.has('HT')).toBe(true);
    expect(state.threatLabels!.E.busy.has('H9')).toBe(true);
    const c = initClassification({ hands: p.hands }, p.threatCardIds!, [], undefined, p.threatSymbolByCardId);
    const west = computeDiscardTiers('W', { hands: p.hands }, 'C', c.threat, c.labels);
    // HK alone guards HJ; HQ only shares the guard of H2 with East.
    expect(west.tier4b).toContain('HK');
    expect(west.tier3b).toContain('HQ');
    expect(west.tier3b).not.toContain('HK');
    const inferred = deriveInverseThreatCards(explainPositionInverse({ hands: p.hands, turn: p.leader }));
    expect(inferred.map((card) => card.cardId).sort()).toEqual([...p.threatCardIds!].sort());
    const next = apply(state, { seat: 'S', suit: 'C', rank: 'A' });
    expect(allThreats(next.state.threat).map((t) => t.threatCardId)).toContain('H2');
    expect(allThreats(state.threat).find((t) => t.threatCardId === 'H2')?.active).toBe(true);
  });

  it('tracks either threat being played independently through immediate and end-of-trick updates', () => {
    for (const played of ['SJ', 'S3'] as const) {
      const p = problem('WA =');
      const before = initClassification({ hands: p.hands }, p.threatCardIds!, [], undefined, p.threatSymbolByCardId);
      const hands = structuredClone(p.hands);
      const owner: Seat = played === 'SJ' ? 'S' : 'N';
      hands[owner].S = hands[owner].S.filter((rank) => `S${rank}` !== played);
      const after = updateClassificationAfterPlay(before, { hands }, played, undefined, 'follow', 'immediate');
      expect(allThreats(after.threat).find((t) => t.threatCardId === played)?.active).toBe(false);
      expect(allThreats(after.threat).find((t) => t.threatCardId !== played)?.active).toBe(true);
      expect(after.perCardRole[played]).toBeUndefined();
      const diff = diffFeatureStates(buildFeatureStateFromClassification(before), buildFeatureStateFromClassification(after));
      expect(diff.suitChanges.some((change) => change.after?.threatCardId === played && !change.after.active)).toBe(true);
      expect(allThreats(before.threat).every((t) => t.active)).toBe(true);
      const settled = updateClassificationAfterPlay(after, { hands }, played, {
        trick: [{ seat: owner, suit: 'S', rank: played === 'SJ' ? 'J' : '3' }]
      }, 'end-of-trick', 'deferred');
      expect(allThreats(settled.threat).find((t) => t.threatCardId !== played)?.active).toBe(true);
    }
  });

  it('includes companions in all five Clash puzzles and completes legal engine play', () => {
    for (const entry of buildPracticeQueue('set5')) {
      expect(entry.problem.threatCardIds).toHaveLength(4);
      let state = init(entry.problem);
      for (let i = 0; i < 52 && state.phase !== 'end'; i++) {
        const play = legalPlays(state)[0];
        expect(play).toBeDefined();
        const result = apply(state, play);
        expect(result.events.some((event) => event.type === 'illegal')).toBe(false);
        state = result.state;
      }
      expect(state.phase).toBe('end');
    }
  });

  it('keeps legacy declarations explicit while new onboarding defaults to both threats', () => {
    const legacy = listEncapsulationWorkbenchEntries().find((entry) => entry.id === 'encap_wla_wb_gt_b_w')!;
    expect(legacy.includeCompanionThreats).toBe(false);
    const bound = bindStandard(legacy.encapsulation);
    expect(buildEncapsulationWorkbenchProblem(legacy).threatCardIds).toEqual(bound.threatCards.map((card) => card.cardId));
    const report = runOnboarding({ encapsulation: 'WLa, wB > wc, WL' });
    expect(report.original.threats?.map((card) => card.cardId)).toEqual(['S9', 'HJ', 'D9', 'H2']);
    expect(renderOnboardingReport(report)).toContain('N: ♥2 (c)');
  });

  it('keeps companion identities valid under random suit, hand, and rank transformations', () => {
    for (let seed = 0; seed < 20; seed++) {
      const p = buildEncapsulationWorkbenchProblem({ id: 'random-companion', name: 'Random companion', encapsulation: "wa, Ww > wA', Wci" },
        { bindingMode: 'random', randomSeed: seed });
      expect(p.threatCardIds).toHaveLength(4);
      expect(() => init(p)).not.toThrow();
      const c = initClassification({ hands: p.hands }, p.threatCardIds!, [], undefined, p.threatSymbolByCardId);
      const capital = allThreats(c.threat).find((t) => t.symbol === "A'")!;
      const companion = allThreats(c.threat).find((t) => t.suit === capital.suit && t.threatCardId !== capital.threatCardId)!;
      expect(companion.establishedOwner).not.toBe(capital.establishedOwner);
      expect(stoppingDefenders(companion, { hands: p.hands })).toEqual([companion.establishedOwner === 'N' ? 'W' : 'E']);
    }
  });

  it('revises only the approved all-tricks legacy case and preserves the two secondary exceptions', () => {
    for (const id of ['encap_wla_wb_gt_b_w', 'encap_wlau_waouou_gt_b_wo', 'encap_wwa_wc_gt_wc_ww']) {
      const entry = listEncapsulationWorkbenchEntries().find((item) => item.id === id)!;
      const p = buildEncapsulationWorkbenchProblem(entry);
      expect(p.threatCardIds?.includes('H3')).toBe(id === 'encap_wwa_wc_gt_wc_ww');
      if (id === 'encap_wwa_wc_gt_wc_ww') {
        expect(p.threatCardIds).toEqual(['S9', 'H9', 'D9', 'H3']);
        expect(p.threatSymbolByCardId?.H3).toBe('c');
      }
    }
  });

  it('requires an explicit companion choice when adapting a new secondary squeeze', () => {
    const entry = { id: 'secondary', name: 'Secondary', encapsulation: 'Wwa, WC > Wc, Ww -1' };
    expect(() => buildEncapsulationWorkbenchProblem(entry)).toThrow(/explicit includeCompanionThreats choice/);
    expect(buildEncapsulationWorkbenchProblem({ ...entry, includeCompanionThreats: false }).threatCardIds).toHaveLength(3);
    expect(buildEncapsulationWorkbenchProblem({ ...entry, includeCompanionThreats: true }).threatCardIds).toHaveLength(4);
  });
});
