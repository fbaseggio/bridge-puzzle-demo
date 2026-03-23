import { describe, expect, it } from 'vitest';
import { demoProblems, normalizeDemoProblemVariantId, resolveDemoProblem } from '../../src/demo/problems';

describe('demo problem variants', () => {
  it('loads sure_tricks_demo as a single multi-variant puzzle by default', () => {
    const entry = demoProblems.find((problem) => problem.id === 'sure_tricks_demo');
    expect(entry).toBeTruthy();
    if (!entry) return;

    const base = resolveDemoProblem(entry);
    expect(base.ewVariants?.map((variant) => variant.id)).toEqual(['a', 'b']);
    expect(base.representativeEwVariantId).toBe('a');
  });

  it('resolves sure_tricks_demo variants under one puzzle id', () => {
    const entry = demoProblems.find((problem) => problem.id === 'sure_tricks_demo');
    expect(entry).toBeTruthy();
    if (!entry) return;

    const versionA = resolveDemoProblem(entry, 'a');
    const versionB = resolveDemoProblem(entry, 'b');

    expect(versionA.id).toBe('sure_tricks_demo');
    expect(versionB.id).toBe('sure_tricks_demo');
    expect(versionA.hands.N).toEqual(versionB.hands.N);
    expect(versionA.hands.S).toEqual(versionB.hands.S);
    expect(versionA.hands.W.S).toEqual(['K', 'Q', 'J']);
    expect(versionA.hands.E.H).toEqual(['J']);
    expect(versionB.hands.W.S).toEqual(['K', 'Q']);
    expect(versionB.hands.W.H).toEqual(['K', 'Q', 'J', '9']);
    expect(versionB.hands.E.S).toEqual(['J']);
  });

  it('normalizes unknown variant ids to the default sure_tricks_demo version', () => {
    const entry = demoProblems.find((problem) => problem.id === 'sure_tricks_demo');
    expect(entry).toBeTruthy();
    if (!entry) return;

    expect(normalizeDemoProblemVariantId(entry, 'missing')).toBe('a');
  });

  it('keeps the combined E/W card set fixed across sure_tricks_demo variants', () => {
    const entry = demoProblems.find((problem) => problem.id === 'sure_tricks_demo');
    expect(entry).toBeTruthy();
    if (!entry) return;

    const ewCards = (variantId: 'a' | 'b') =>
      (['E', 'W'] as const)
        .flatMap((seat) =>
          (['S', 'H', 'D', 'C'] as const).flatMap((suit) =>
            resolveDemoProblem(entry, variantId).hands[seat][suit].map((rank) => `${suit}${rank}`)
          )
        )
        .sort();

    expect(ewCards('a')).toEqual(ewCards('b'));
  });

  it('keeps the designated threat set fixed across sure_tricks_demo variants', () => {
    const entry = demoProblems.find((problem) => problem.id === 'sure_tricks_demo');
    expect(entry).toBeTruthy();
    if (!entry) return;

    const threats = resolveDemoProblem(entry).threatCardIds?.slice().sort();
    expect(threats).toEqual(['HT', 'ST']);
    expect(resolveDemoProblem(entry, 'a').threatCardIds?.slice().sort()).toEqual(threats);
    expect(resolveDemoProblem(entry, 'b').threatCardIds?.slice().sort()).toEqual(threats);
  });
});
