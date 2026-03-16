import { describe, expect, it } from 'vitest';
import { bindStandard, computeSpecifiedCardCounts, parseEncapsulation } from '../../src/encapsulation';

describe('encapsulation parser', () => {
  it('normalizes commas and spaces and maps suits in standard order', () => {
    const parsed = parseEncapsulation('Wa,   a   >   w');
    expect(parsed.lead).toBe('>');
    expect(parsed.goalOffset).toBe(0);
    expect(parsed.suits).toEqual([
      { suit: 'S', primary: 'N', pattern: 'Wa', allowIdleFill: true },
      { suit: 'H', primary: 'N', pattern: 'a', allowIdleFill: true },
      { suit: 'D', primary: 'S', pattern: 'w', allowIdleFill: true }
    ]);
  });

  it('parses lead symbol variants', () => {
    expect(parseEncapsulation('w < a').lead).toBe('<');
    expect(parseEncapsulation('w = a').lead).toBe('=');
    expect(parseEncapsulation('w > a').lead).toBe('>');
  });

  it('tracks north/south primary suit counts', () => {
    const parsed = parseEncapsulation('WLa, WB > b, W');
    expect(parsed.northPrimaryCount).toBe(2);
    expect(parsed.southPrimaryCount).toBe(2);
  });

  it('parses trailing goal offset and suit no-idle marker', () => {
    const parsed = parseEncapsulation("WLa, WB > b', W -1");
    expect(parsed.goalOffset).toBe(-1);
    expect(parsed.suits[2]).toEqual({ suit: 'D', primary: 'S', pattern: 'b', allowIdleFill: false });
    expect(parsed.suits[3]).toEqual({ suit: 'C', primary: 'S', pattern: 'W', allowIdleFill: true });
  });
});

describe('specified counts and default hand size', () => {
  it('computes specified counts and default hand size from parsed letters', () => {
    const counts = computeSpecifiedCardCounts('Wa, a > w');
    expect(counts).toEqual({ specifiedNorth: 3, specifiedSouth: 0 });

    const bound = bindStandard('Wa, a > w');
    expect(bound.metadata.defaultHandSize).toBe(3);
    expect(bound.metadata.finalHandSize).toBeGreaterThanOrEqual(3);
  });
});

describe('deterministic binding examples', () => {
  it('binds Wa, a > w with expected structural cards', () => {
    const b = bindStandard('Wa, a > w');
    expect(b.hands.N.S).toEqual(['A', 'J']);
    expect(b.hands.W.S).toEqual(['K', 'Q']);
    expect(b.hands.S.S).toContain('2');
    expect(b.hands.N.H).toEqual(['K']);
    expect(b.hands.S.D).toEqual(['A']);
  });

  it('binds Wwc > a, b, W deterministically', () => {
    const b = bindStandard('Wwc > a, b, W');
    expect(b.hands.N.S).toEqual(['A', 'K', '6']);
    expect(b.hands.S.S).toContain('2');
    expect(b.hands.E.S.length + b.hands.W.S.length).toBeGreaterThan(0);
  });

  it('binds WLa, WB > b, W with discussed suit structures', () => {
    const b = bindStandard('WLa, WB > b, W');
    expect(b.hands.N.S).toEqual(['A', '9', '3']);
    expect(b.hands.S.S).toEqual(['K', '2']);
    expect(b.hands.W.S).toEqual(['Q', 'J', 'T']);
    expect(b.hands.N.H).toEqual(['A', '3']);
    expect(b.hands.S.H).toEqual(['J', '2']);
  });

  it("respects no-idle marker by preventing idle fill in that suit", () => {
    const plain = bindStandard('WLa, WB > b, W');
    const noIdle = bindStandard("WLa, WB > b', W");
    expect(plain.hands.E.D.length + plain.hands.W.D.length).toBeGreaterThanOrEqual(
      noIdle.hands.E.D.length + noIdle.hands.W.D.length
    );
    expect(noIdle.hands.E.D.length + noIdle.hands.W.D.length).toBe(1);
  });

  it('binds a, Wc > Wwc, WW and equalizes final hand sizes', () => {
    const b = bindStandard('a, Wc > Wwc, WW');
    const sizes = [
      b.hands.N.S.length + b.hands.N.H.length + b.hands.N.D.length + b.hands.N.C.length,
      b.hands.E.S.length + b.hands.E.H.length + b.hands.E.D.length + b.hands.E.C.length,
      b.hands.S.S.length + b.hands.S.H.length + b.hands.S.D.length + b.hands.S.C.length,
      b.hands.W.S.length + b.hands.W.H.length + b.hands.W.D.length + b.hands.W.C.length
    ];
    expect(new Set(sizes).size).toBe(1);
  });

  it('binds wL = with flexible lead and expected one-suit NS holding', () => {
    const b = bindStandard('wL =');
    expect(b.lead).toBe('=');
    expect(b.hands.N.S).toEqual(['A', '2']);
    expect(b.hands.S.S).toContain('K');
  });

  it('binds WA = with flexible lead and expected one-suit NS holding', () => {
    const b = bindStandard('WA =');
    expect(b.lead).toBe('=');
    expect(b.hands.N.S).toEqual(['A', '3']);
    expect(b.hands.S.S).toEqual(['8', '2']);
  });

  it('exports bound threat cards for lowercase and uppercase threat symbols', () => {
    const lower = bindStandard('Wa, a > w');
    expect(lower.threatCards.some((t) => t.symbol === 'a' && t.cardId === 'SJ' && t.seat === 'N')).toBe(true);

    const upper = bindStandard('WB =');
    expect(upper.threatCards.some((t) => t.symbol === 'B' && t.cardId === 'SJ' && t.seat === 'S')).toBe(true);
  });
});
