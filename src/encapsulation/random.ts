import { bindStandard } from './binder';
import { parseEncapsulation } from './parser';
import type { BoundEncapsulation, FourHands, ParsedEncapsulation, Seat, Suit } from './types';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const SEATS: Seat[] = ['N', 'E', 'S', 'W'];
const RANKS_HIGH_TO_LOW = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

export type BindRandomOptions = {
  seed?: number;
  rng?: () => number;
  swapNS?: boolean;
  resolveEqualLeadAs?: '<' | '>';
  suitPermutation?: [Suit, Suit, Suit, Suit];
};

function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rankIndex(rank: string): number {
  const idx = RANKS_HIGH_TO_LOW.indexOf(rank);
  return idx >= 0 ? idx : 99;
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function normalizeRng(options?: BindRandomOptions): () => number {
  if (options?.rng) return options.rng;
  if (typeof options?.seed === 'number') return createSeededRng(options.seed);
  return Math.random;
}

function invertLead(lead: ParsedEncapsulation['lead']): ParsedEncapsulation['lead'] {
  if (lead === '>') return '<';
  if (lead === '<') return '>';
  return '=';
}

function cloneParsed(parsed: ParsedEncapsulation): ParsedEncapsulation {
  return {
    ...parsed,
    suits: parsed.suits.map((s) => ({ ...s }))
  };
}

function chooseSuitPermutation(rng: () => number, options?: BindRandomOptions): [Suit, Suit, Suit, Suit] {
  if (options?.suitPermutation) return options.suitPermutation;
  const perm = shuffled(SUITS, rng);
  return [perm[0], perm[1], perm[2], perm[3]];
}

export function prepareRandomBindingInput(
  input: string | ParsedEncapsulation,
  options?: BindRandomOptions
): ParsedEncapsulation {
  const rng = normalizeRng(options);
  const base = typeof input === 'string' ? parseEncapsulation(input) : cloneParsed(input);
  const shouldSwap = typeof options?.swapNS === 'boolean' ? options.swapNS : rng() < 0.5;

  let parsed = cloneParsed(base);
  if (shouldSwap) {
    const north = base.suits
      .filter((s) => s.primary === 'N')
      .map((s) => ({ pattern: s.pattern, allowIdleFill: s.allowIdleFill, isEmpty: s.isEmpty }));
    const south = base.suits
      .filter((s) => s.primary === 'S')
      .map((s) => ({ pattern: s.pattern, allowIdleFill: s.allowIdleFill, isEmpty: s.isEmpty }));
    const reordered = [...south.map((s) => ({ primary: 'N' as const, ...s })), ...north.map((s) => ({ primary: 'S' as const, ...s }))];
    parsed = {
      ...parsed,
      lead: invertLead(base.lead),
      northPrimaryCount: south.length,
      southPrimaryCount: north.length,
      suits: reordered.map((s, idx) => ({
        suit: SUITS[idx],
        primary: s.primary,
        pattern: s.pattern,
        allowIdleFill: s.allowIdleFill,
        isEmpty: s.isEmpty
      }))
    };
  }

  if (parsed.lead === '=') {
    parsed.lead = options?.resolveEqualLeadAs ?? (rng() < 0.5 ? '<' : '>');
  }

  const permutation = chooseSuitPermutation(rng, options);
  const map: Record<Suit, Suit> = {
    S: permutation[0],
    H: permutation[1],
    D: permutation[2],
    C: permutation[3]
  };
  parsed.suits = parsed.suits.map((s) => ({ ...s, suit: map[s.suit] }));
  return parsed;
}

function relabelRanksOrdinally(bound: BoundEncapsulation, rng: () => number): BoundEncapsulation {
  const out: BoundEncapsulation = {
    ...bound,
    hands: {
      N: { S: [...bound.hands.N.S], H: [...bound.hands.N.H], D: [...bound.hands.N.D], C: [...bound.hands.N.C] },
      E: { S: [...bound.hands.E.S], H: [...bound.hands.E.H], D: [...bound.hands.E.D], C: [...bound.hands.E.C] },
      S: { S: [...bound.hands.S.S], H: [...bound.hands.S.H], D: [...bound.hands.S.D], C: [...bound.hands.S.C] },
      W: { S: [...bound.hands.W.S], H: [...bound.hands.W.H], D: [...bound.hands.W.D], C: [...bound.hands.W.C] }
    },
    threatCards: bound.threatCards.map((t) => ({ ...t })),
    parsed: cloneParsed(bound.parsed)
  };

  for (const suit of SUITS) {
    const cards: Array<{ seat: Seat; rank: string }> = [];
    for (const seat of SEATS) {
      for (const rank of out.hands[seat][suit]) cards.push({ seat, rank });
    }
    const k = cards.length;
    if (k === 0) continue;

    cards.sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank));
    const seatPattern = cards.map((c) => c.seat);
    const oldRanks = cards.map((c) => c.rank);
    const chosen = shuffled(RANKS_HIGH_TO_LOW, rng).slice(0, k).sort((a, b) => rankIndex(a) - rankIndex(b));
    const oldToNew = new Map<string, string>();
    for (let i = 0; i < k; i += 1) oldToNew.set(oldRanks[i], chosen[i]);

    for (const seat of SEATS) out.hands[seat][suit] = [];
    for (let i = 0; i < k; i += 1) {
      out.hands[seatPattern[i]][suit].push(chosen[i]);
    }
    for (const seat of SEATS) out.hands[seat][suit].sort((a, b) => rankIndex(a) - rankIndex(b));

    for (const threat of out.threatCards) {
      if (threat.suit !== suit) continue;
      const nextRank = oldToNew.get(threat.rank);
      if (!nextRank) continue;
      threat.rank = nextRank;
      threat.cardId = `${suit}${nextRank}`;
    }
  }

  return out;
}

export function bindRandom(input: string | ParsedEncapsulation, options?: BindRandomOptions): BoundEncapsulation {
  const rng = normalizeRng(options);
  const parsed = prepareRandomBindingInput(input, options);
  const standard = bindStandard(parsed);
  return relabelRanksOrdinally(standard, rng);
}
