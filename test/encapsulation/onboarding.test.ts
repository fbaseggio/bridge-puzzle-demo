import { describe, expect, it, vi } from 'vitest';
import { parseEncapsulation } from '../../src/encapsulation';
import { generateCookTweaks, renderOnboardingReport, runOnboarding, type DdsRequest, type DdsResult } from '../../tools/onboarding';

const ENCAP = "[schd] wA' Ww > WLc, c";

function scored(request: DdsRequest, max: number): DdsResult {
  const cards = Object.entries(request.hands[request.turn]).flatMap(([suit, ranks]) => ranks.map((rank) => suit + rank));
  return {
    maxTricksNS: max, tricksByOpeningCard: Object.fromEntries(cards.map((card) => [card, max])),
    optimalOpeningCards: cards, goalWinningOpeningCards: max >= request.goal ? cards : [],
    pbn: 'fixture', version: 'fixture', allOptimalModeAgrees: true
  };
}

describe('onboarding cook tweaks', () => {
  it('gives the Clash-B candidate exactly its one agreed apostrophe-removal check', () => {
    expect(generateCookTweaks(ENCAP)).toEqual([
      { id: 'S-2', suit: 'S', tokenNumber: 2, from: "A'", to: 'A', encapsulation: '[schd] wA, Ww > WLc, c' }
    ]);
  });

  it('changes single tokens independently, preserving suits, primary hands, lead, offset, and no-idle markers', () => {
    const input = "[cdhs] abAB, A'B'g'G' > A*B*, b' -1";
    const original = parseEncapsulation(input);
    const tweaks = generateCookTweaks(input);
    expect(tweaks.map(({ from, to }) => [from, to])).toEqual([
      ['a', 'c'], ['b', 'c'], ['A', 'C'], ['B', 'C'],
      ["A'", 'A'], ["B'", 'B'], ["g'", 'g'], ["G'", 'G'], ['b', 'c']
    ]);
    for (const tweak of tweaks) {
      const parsed = parseEncapsulation(tweak.encapsulation);
      expect(parsed.suitOrder).toEqual(original.suitOrder);
      expect(parsed.lead).toBe('>');
      expect(parsed.goalOffset).toBe(-1);
      expect(parsed.suits.map((suit) => [suit.primary, suit.allowIdleFill])).toEqual(original.suits.map((suit) => [suit.primary, suit.allowIdleFill]));
      expect(parsed.suits.filter((suit, index) => suit.pattern !== original.suits[index].pattern)).toHaveLength(1);
      expect(parsed.suits[2].pattern).toBe('A*B*');
    }
    expect(tweaks[0].encapsulation).toBe("[cdhs] cbAB, A'B'g'G' > A*B*, b' -1");
    expect(tweaks[1].encapsulation).toBe("[cdhs] acAB, A'B'g'G' > A*B*, b' -1");
    expect(tweaks[tweaks.length - 1].encapsulation).toBe("[cdhs] abAB, A'B'g'G' > A*B*, c' -1");
  });
});

describe('onboarding review', () => {
  it('keeps a secondary squeeze pending until companions are explicitly included or omitted', () => {
    for (const includeCompanionThreats of [undefined, true, false]) {
      let call = 0;
      const solver = vi.fn((request: DdsRequest) => scored(request, ++call === 1 ? 5 : 4));
      const report = runOnboarding({ encapsulation: `${ENCAP} -1`, includeCompanionThreats }, solver);
      expect(report.automatedStatus).toBe(includeCompanionThreats === undefined ? 'needs-review' : 'passed');
      expect(report.dda.status).toBe('pass');
      expect(report.cooks[0].dda.status).toBe('pass');
      expect(solver).toHaveBeenCalledTimes(2);
      for (const binding of [report.original, ...report.cooks]) {
        expect(binding.companionThreatDecisionRequired).toBe(includeCompanionThreats === undefined);
        expect(binding.includeCompanionThreats).toBe(includeCompanionThreats);
        if (includeCompanionThreats === undefined) expect(binding.threats).toBeUndefined();
        else expect(binding.threats).toHaveLength(includeCompanionThreats ? 4 : 3);
      }
      if (includeCompanionThreats === undefined) expect(renderOnboardingReport(report)).toContain('Threat selection PENDING');
    }
  });

  it('reports a stable original and a failed tweak without approving the candidate', () => {
    let call = 0;
    const solver = vi.fn((request: DdsRequest) => scored(request, ++call === 1 ? 6 : 5));
    const report = runOnboarding({ encapsulation: ENCAP, title: 'Type R Clash-B', source: 'Moon hex clash 2' }, solver);
    expect(report.automatedStatus).toBe('passed');
    expect(report.reviewStatus).toBe('pending');
    expect(report.target).toBe(6);
    expect(report.encapsulation).toMatchObject({ e1: "[schd] wA', Wwu > WLc, c", stable: true, differences: [] });
    expect(report.encapsulation.e2).toBe(report.encapsulation.e1);
    expect(report.original.bound?.hands.E.C).toEqual(['Q']);
    expect(report.cooks[0].bound?.hands.E.S).toEqual(['K', 'Q']);
    expect(report.cooks[0].bound?.hands.E.C).toEqual([]);
    expect(solver).toHaveBeenCalledTimes(2);
    expect(solver.mock.calls.map(([request]) => [request.goal, request.turn, request.strain])).toEqual([[6, 'S', 'NT'], [6, 'S', 'NT']]);
    const markdown = renderOnboardingReport(report);
    expect(markdown).toContain('West                              East');
    expect(markdown).toContain('Moon hex clash 2');
    expect(markdown).toContain('Human review: **pending**');
    expect(markdown).toContain("A' → A");
  });

  it('uses the original offset target and flags a surviving cook', () => {
    const solver = vi.fn((request: DdsRequest) => scored(request, 5));
    const report = runOnboarding({ encapsulation: `${ENCAP} -1`, strain: 'H' }, solver);
    expect(report.target).toBe(5);
    expect(report.dda.status).toBe('pass');
    expect(report.cooks[0].dda.status).toBe('fail');
    expect(report.automatedStatus).toBe('needs-review');
    expect(solver.mock.calls.map(([request]) => [request.goal, request.strain])).toEqual([[5, 'H'], [5, 'H']]);
    expect(renderOnboardingReport(report)).toContain('COOK FOUND');
  });

  it('flags an original that cannot reach its target', () => {
    const report = runOnboarding({ encapsulation: ENCAP }, (request) => scored(request, 5));
    expect(report.dda.status).toBe('fail');
    expect(report.automatedStatus).toBe('needs-review');
  });

  it('reports skipped or failed solver work as inconclusive, never a successful cook check', () => {
    const skipped = runOnboarding({ encapsulation: ENCAP });
    expect(skipped.automatedStatus).toBe('incomplete');
    expect(skipped.cooks[0].dda.status).toBe('inconclusive');
    let call = 0;
    const failed = runOnboarding({ encapsulation: ENCAP }, (request) => {
      if (++call === 2) throw new Error('DDS unavailable');
      return scored(request, 6);
    });
    expect(failed.dda.status).toBe('pass');
    expect(failed.cooks[0].dda).toEqual({ status: 'inconclusive', error: 'DDS unavailable' });
    expect(failed.automatedStatus).toBe('incomplete');
  });

  it.each(['bad input', 'Wf > wLF', `${ENCAP} +1`])('does not send invalid bindings or targets to DDS: %s', (encapsulation) => {
    const solver = vi.fn((request: DdsRequest) => scored(request, 0));
    const report = runOnboarding({ encapsulation }, solver);
    expect(report.original.errors.length).toBeGreaterThan(0);
    expect(report.automatedStatus).toBe('incomplete');
    expect(solver).not.toHaveBeenCalled();
  });

  it('requires a flexible lead to be selected and rejects a conflicting override', () => {
    const solver = vi.fn((request: DdsRequest) => scored(request, 2));
    const unresolved = runOnboarding({ encapsulation: 'WA =' }, solver);
    expect(unresolved.encapsulation.e1).toBeUndefined();
    expect(unresolved.automatedStatus).toBe('incomplete');
    runOnboarding({ encapsulation: ENCAP, leader: 'N' }, solver);
    expect(solver).not.toHaveBeenCalled();
    const resolved = runOnboarding({ encapsulation: 'WA =', leader: 'N' }, solver);
    expect(resolved.leader).toBe('N');
    expect(solver.mock.calls.every(([request]) => request.turn === 'N')).toBe(true);
    expect(solver).toHaveBeenCalled();
  });

  it('does not inherit old fixture permissions; records explicit exceptions while retaining E1/E2 checks', () => {
    const original = runOnboarding({ encapsulation: 'Waou >' });
    expect(original.encapsulation.differences.length).toBeGreaterThan(0);
    const permitted = runOnboarding({ encapsulation: 'Waou >', allowAdditionalThreats: 'Owner reviewed this representation' });
    expect(permitted.encapsulation.differences).toEqual([]);
    const mirror = runOnboarding({ encapsulation: 'Wf > LF, w', omitOriginalComparison: 'Owner reviewed L/W and F/fm mirror' });
    expect(mirror.encapsulation.differences).toEqual([]);
    expect(mirror.encapsulation.stable).toBe(true);
    expect(renderOnboardingReport(mirror)).toContain('OMITTED by explicit permission: Owner reviewed L/W and F/fm mirror');
  });
});
