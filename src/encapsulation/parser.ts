import type { EncapsulationToken, LeadSymbol, ParsedEncapsulation, ParsedSuit, Suit } from './types';

const VALID_TOKENS = new Set<EncapsulationToken>([
  'w',
  'W',
  'l',
  'L',
  'a',
  'A',
  'b',
  'B',
  'c',
  'C',
  'f',
  'F',
  'g',
  'G',
  'i',
  'm',
  'o',
  'u'
]);
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
  const m = trimmed.match(/^(.*)\s+([+-]\d+)$/);
  if (!m) return { suitsPart: trimmed, goalOffset: 0 };
  const suitsPart = (m[1] ?? '').trim();
  const rawOffset = m[2];
  const goalOffset = Number.parseInt(rawOffset, 10);
  if (!Number.isInteger(goalOffset) || !Number.isFinite(goalOffset)) {
    throw new Error(`Invalid signed goal offset '${rawOffset}' in '${part}'`);
  }
  return { suitsPart, goalOffset };
}

function parseSuitPattern(rawPattern: string): { pattern: string; allowIdleFill: boolean } {
  const trimmed = rawPattern.trim();
  if (!trimmed) throw new Error('Empty suit pattern is not allowed');
  if (trimmed === '0') {
    return { pattern: '', allowIdleFill: false };
  }
  let allowIdleFill = true;
  let pattern = '';
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i] as string;
    if (ch !== "'") {
      pattern += ch;
      continue;
    }
    const prev = i > 0 ? trimmed[i - 1] : '';
    // g' / G' token suffix
    if (prev === 'g' || prev === 'G') {
      pattern += ch;
      continue;
    }
    // Suit-level no-idle suffix.
    if (i === trimmed.length - 1) {
      allowIdleFill = false;
      continue;
    }
    throw new Error(`Invalid apostrophe marker placement in suit pattern '${rawPattern}'`);
  }
  if (!pattern) throw new Error(`Missing suit tokens before apostrophe in pattern '${rawPattern}'`);
  return { pattern, allowIdleFill };
}

function extractHeader(source: string): { body: string; suitOrder: Suit[]; explicitSuitOrder: boolean } {
  const trimmed = source.trim();
  const header = trimmed.match(/^\[([shdcSHDC]+)\]\s*(.*)$/);
  if (!header) return { body: source, suitOrder: [...SUIT_ORDER], explicitSuitOrder: false };
  const raw = header[1].toLowerCase();
  const body = header[2] ?? '';
  if (raw.length === 0 || raw.length > 4) throw new Error(`Invalid suit-order header '[${raw}]'`);
  const chars = [...raw];
  const uniq = new Set(chars);
  if (uniq.size !== chars.length) throw new Error(`Duplicate suits in suit-order header '[${raw}]'`);
  const mapped = chars.map((ch) => {
    if (ch === 's') return 'S';
    if (ch === 'h') return 'H';
    if (ch === 'd') return 'D';
    if (ch === 'c') return 'C';
    throw new Error(`Invalid suit '${ch}' in suit-order header '[${raw}]'`);
  }) as Suit[];
  return { body, suitOrder: mapped, explicitSuitOrder: true };
}

function assertTokens(pattern: string): void {
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i] as string;
    if (ch === "'") {
      const prev = i > 0 ? pattern[i - 1] : '';
      if (prev === 'g' || prev === 'G') continue;
      throw new Error(`Invalid token '${ch}' in suit pattern '${pattern}'`);
    }
    if (!VALID_TOKENS.has(ch as EncapsulationToken)) {
      throw new Error(`Invalid token '${ch}' in suit pattern '${pattern}'`);
    }
  }
}

export function parseEncapsulation(text: string): ParsedEncapsulation {
  const source = text.trim();
  const header = extractHeader(source);
  const core = header.body.trim();
  if (!source) {
    return {
      source,
      lead: '=',
      suits: [],
      northPrimaryCount: 0,
      southPrimaryCount: 0,
      goalOffset: 0,
      suitOrder: [...SUIT_ORDER],
      explicitSuitOrder: false
    };
  }

  const symbols = [...core.matchAll(/[><=]/g)].map((m) => ({ symbol: m[0] as LeadSymbol, index: m.index ?? -1 }));
  if (symbols.length !== 1) {
    throw new Error(`Expected exactly one lead symbol (>, <, =) in '${source}'`);
  }
  const { symbol, index } = symbols[0];
  const left = core.slice(0, index).trim();
  const rightRaw = core.slice(index + 1).trim();
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
  if (all.length > header.suitOrder.length) {
    throw new Error(`Suit-order header provides ${header.suitOrder.length} suits but ${all.length} suit strings were provided`);
  }

  const suits: ParsedSuit[] = all.map((entry, idx) => {
    assertTokens(entry.pattern);
    const suit = header.suitOrder[idx] ?? SUIT_ORDER[idx];
    if (!suit) throw new Error(`Cannot map suit index ${idx} to standard suit order`);
    return {
      suit,
      primary: entry.primary,
      pattern: entry.pattern,
      allowIdleFill: entry.allowIdleFill,
      isEmpty: entry.pattern.length === 0
    };
  });

  return {
    source,
    lead: symbol,
    suits,
    northPrimaryCount: leftSuits.length,
    southPrimaryCount: rightSuits.length,
    goalOffset,
    suitOrder: header.suitOrder,
    explicitSuitOrder: header.explicitSuitOrder
  };
}
