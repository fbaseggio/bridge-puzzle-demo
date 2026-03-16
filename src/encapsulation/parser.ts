import type { EncapsulationToken, LeadSymbol, ParsedEncapsulation, ParsedSuit, Suit } from './types';

const VALID_TOKENS = new Set<EncapsulationToken>(['w', 'W', 'l', 'L', 'a', 'A', 'b', 'B', 'c', 'C', 'i']);
const SUIT_ORDER: Suit[] = ['S', 'H', 'D', 'C'];

function splitSuitStrings(part: string): string[] {
  return part
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractGoalOffset(part: string): { suitsPart: string; goalOffset: number } {
  const trimmed = part.trim();
  if (!trimmed) return { suitsPart: '', goalOffset: 0 };
  const m = trimmed.match(/^(.*?)(?:\s+([+-]?\d+))?$/);
  if (!m) throw new Error(`Could not parse right-hand expression '${part}'`);
  const suitsPart = (m[1] ?? '').trim();
  const rawOffset = m[2];
  const goalOffset = rawOffset ? Number.parseInt(rawOffset, 10) : 0;
  if (!Number.isInteger(goalOffset)) {
    throw new Error(`Invalid goal offset '${rawOffset}' in '${part}'`);
  }
  return { suitsPart, goalOffset };
}

function parseSuitPattern(rawPattern: string): { pattern: string; allowIdleFill: boolean } {
  const trimmed = rawPattern.trim();
  if (!trimmed) throw new Error('Empty suit pattern is not allowed');
  const apostrophes = (trimmed.match(/'/g) ?? []).length;
  if (apostrophes > 1 || (apostrophes === 1 && !trimmed.endsWith("'"))) {
    throw new Error(`Invalid apostrophe marker placement in suit pattern '${rawPattern}'`);
  }
  const allowIdleFill = !trimmed.endsWith("'");
  const pattern = allowIdleFill ? trimmed : trimmed.slice(0, -1);
  if (!pattern) throw new Error(`Missing suit tokens before apostrophe in pattern '${rawPattern}'`);
  return { pattern, allowIdleFill };
}

function assertTokens(pattern: string): void {
  for (const ch of pattern) {
    if (!VALID_TOKENS.has(ch as EncapsulationToken)) {
      throw new Error(`Invalid token '${ch}' in suit pattern '${pattern}'`);
    }
  }
}

export function parseEncapsulation(text: string): ParsedEncapsulation {
  const source = text.trim();
  if (!source) {
    return {
      source,
      lead: '=',
      suits: [],
      northPrimaryCount: 0,
      southPrimaryCount: 0,
      goalOffset: 0
    };
  }

  const symbols = [...source.matchAll(/[><=]/g)].map((m) => ({ symbol: m[0] as LeadSymbol, index: m.index ?? -1 }));
  if (symbols.length !== 1) {
    throw new Error(`Expected exactly one lead symbol (>, <, =) in '${source}'`);
  }
  const { symbol, index } = symbols[0];
  const left = source.slice(0, index).trim();
  const rightRaw = source.slice(index + 1).trim();
  const { suitsPart: right, goalOffset } = extractGoalOffset(rightRaw);

  const leftSuits = splitSuitStrings(left).map(parseSuitPattern);
  const rightSuits = splitSuitStrings(right).map(parseSuitPattern);
  const all = [
    ...leftSuits.map((s) => ({ primary: 'N' as const, ...s })),
    ...rightSuits.map((s) => ({ primary: 'S' as const, ...s }))
  ];

  if (all.length > 4) {
    throw new Error(`At most 4 suit strings are supported; got ${all.length}`);
  }

  const suits: ParsedSuit[] = all.map((entry, idx) => {
    assertTokens(entry.pattern);
    const suit = SUIT_ORDER[idx];
    if (!suit) throw new Error(`Cannot map suit index ${idx} to standard suit order`);
    return {
      suit,
      primary: entry.primary,
      pattern: entry.pattern,
      allowIdleFill: entry.allowIdleFill
    };
  });

  return {
    source,
    lead: symbol,
    suits,
    northPrimaryCount: leftSuits.length,
    southPrimaryCount: rightSuits.length,
    goalOffset
  };
}
