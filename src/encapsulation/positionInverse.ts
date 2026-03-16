import { inferSuitAbstractionDetailed } from './inverse';
import type { InverseResult, Side, Suit } from './types';

const DEFAULT_ORDER: Suit[] = ['S', 'H', 'D', 'C'];

export type PositionInverseInput = {
  hands: Record<Side, Record<Suit, string[]>>;
  turn: Side;
  suitOrder?: Suit[];
  threatCardIds?: string[];
  preferredPrimaryBySuit?: Partial<Record<Suit, 'N' | 'S'>>;
};

type SuitInference = {
  text: string;
  primary: 'N' | 'S' | 'unknown';
  raw: InverseResult;
};

export type PositionInverseDetailed = {
  text: string;
  primaryBySuit: Partial<Record<Suit, 'N' | 'S'>>;
};

export type SuitStopExplanation = {
  seat: 'N' | 'S';
  rank: string;
  backing: number;
  westStops: boolean;
  eastStops: boolean;
};

export type SuitInverseExplanation = {
  suit: Suit;
  slotIndex: number;
  totalSlots: number;
  header: string;
  cards: Record<Side, string[]>;
  preferredPrimary: 'N' | 'S' | null;
  chosenPrimary: 'N' | 'S' | 'unknown';
  winners: string[];
  threatCandidates: string[];
  stopChecks: SuitStopExplanation[];
  threatCardTieBreakUsed: boolean;
  lineageOuResolutionUsed: boolean;
  countSummary: string;
  finalText: string;
  raw: InverseResult;
};

export type PositionInverseExplanation = {
  shortText: string;
  header: string;
  primaryBySuit: Partial<Record<Suit, 'N' | 'S'>>;
  suits: SuitInverseExplanation[];
};

function headerFromOrder(order: Suit[]): string {
  return `[${order.map((s) => s.toLowerCase()).join('')}]`;
}

export function renderPositionEncapsulationSlots(
  order: Suit[],
  slotTexts: string[],
  turn: Side
): string {
  const leftTarget = Math.ceil(order.length / 2);
  const left = slotTexts.slice(0, leftTarget);
  const right = slotTexts.slice(leftTarget);
  return `${headerFromOrder(order)} ${left.join(', ')} ${leadSymbolFromTurn(turn)} ${right.join(', ')}`.replace(/\s+/g, ' ').trim();
}

function leadSymbolFromTurn(turn: Side): '<' | '>' | '=' {
  if (turn === 'N') return '<';
  if (turn === 'S') return '>';
  return '=';
}

function suitRanks(hands: PositionInverseInput['hands'], suit: Suit): Record<Side, string[]> {
  return {
    N: [...hands.N[suit]],
    E: [...hands.E[suit]],
    S: [...hands.S[suit]],
    W: [...hands.W[suit]]
  };
}

function isEmptySuit(ranks: Record<Side, string[]>): boolean {
  return ranks.N.length + ranks.E.length + ranks.S.length + ranks.W.length === 0;
}

function prettyResult(result: InverseResult): string {
  if (typeof result === 'string') return result;
  if (result.type === 'no-fit') return '{no-fit}';
  return `{ambiguous:${result.candidates.join('|')}}`;
}

function resolveOuAmbiguity(
  raw: InverseResult,
  ranks: Record<Side, string[]>,
  preferredPrimary?: 'N' | 'S'
): string | null {
  if (!preferredPrimary) return null;
  if (typeof raw === 'string' || raw.type !== 'ambiguous') return null;
  const set = new Set(raw.candidates);
  if (!(set.has('o') && set.has('u')) || set.size !== 2) return null;

  const westCount = ranks.W.length;
  const eastCount = ranks.E.length;
  if (preferredPrimary === 'N') {
    if (westCount > 0 && eastCount === 0) return 'o';
    if (eastCount > 0 && westCount === 0) return 'u';
  } else {
    if (eastCount > 0 && westCount === 0) return 'o';
    if (westCount > 0 && eastCount === 0) return 'u';
  }
  return null;
}

function inferSuit(
  hands: PositionInverseInput['hands'],
  suit: Suit,
  threatCardIds?: string[],
  preferredPrimary?: 'N' | 'S'
): SuitInference {
  const ranks = suitRanks(hands, suit);
  if (isEmptySuit(ranks)) {
    return { text: '0', primary: 'unknown', raw: { type: 'no-fit' } };
  }
  const detailed = inferSuitAbstractionDetailed(
    { N: ranks.N, E: ranks.E, S: ranks.S, W: ranks.W },
    { suit, threatCardIds }
  );
  const result = detailed.result;
  const resolvedOu = resolveOuAmbiguity(result, ranks, preferredPrimary);
  const singletonPrimary: 'N' | 'S' | null =
    ranks.N.length + ranks.S.length === 1 ? (ranks.N.length === 1 ? 'N' : 'S') : null;
  const resolvedPrimary =
    singletonPrimary ??
    (detailed.primary === 'unknown' && resolvedOu && preferredPrimary ? preferredPrimary : detailed.primary);
  return {
    text: resolvedOu ?? prettyResult(result),
    primary: resolvedPrimary,
    raw: result
  };
}

function rankIndex(rank: string): number {
  return ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'].indexOf(rank);
}

function obviousWinners(cards: Record<Side, string[]>): string[] {
  const opp = [...cards.E, ...cards.W];
  const winners: string[] = [];
  for (const seat of ['N', 'S'] as const) {
    for (const rank of cards[seat]) {
      const idx = rankIndex(rank);
      if (!opp.some((r) => rankIndex(r) < idx)) winners.push(`${seat}${rank}`);
    }
  }
  return winners;
}

function stopChecks(cards: Record<Side, string[]>): SuitStopExplanation[] {
  const out: SuitStopExplanation[] = [];
  for (const seat of ['N', 'S'] as const) {
    const sorted = [...cards[seat]].sort((a, b) => rankIndex(a) - rankIndex(b));
    for (let i = 0; i < sorted.length; i += 1) {
      const rank = sorted[i];
      const idx = rankIndex(rank);
      const needed = i + 1;
      const westStops = cards.W.length >= needed && cards.W.some((r) => rankIndex(r) < idx);
      const eastStops = cards.E.length >= needed && cards.E.some((r) => rankIndex(r) < idx);
      out.push({ seat, rank, backing: i, westStops, eastStops });
    }
  }
  return out;
}

function countSummaryFor(text: string, chosenPrimary: 'N' | 'S' | 'unknown', cards: Record<Side, string[]>): string {
  if (chosenPrimary === 'unknown' || text.startsWith('{')) {
    return `obs N:${cards.N.length} E:${cards.E.length} S:${cards.S.length} W:${cards.W.length}`;
  }
  if (text === '0') return 'empty suit';
  const counts = {
    W: (text.match(/W/g) ?? []).length,
    L: (text.match(/L/g) ?? []).length,
    w: (text.match(/w/g) ?? []).length,
    l: (text.match(/l/g) ?? []).length,
    a: (text.match(/a/g) ?? []).length,
    b: (text.match(/b/g) ?? []).length,
    c: (text.match(/c/g) ?? []).length,
    i: (text.match(/i/g) ?? []).length,
    o: (text.match(/o/g) ?? []).length,
    u: (text.match(/u/g) ?? []).length
  };
  const links = counts.W + counts.L + counts.w + counts.l;
  const stopperSize = links + 1;
  const encPrimary = counts.W + counts.L + counts.w + counts.l + counts.a + counts.b + counts.c + counts.i;
  const encOpposite = counts.W + counts.L;
  const encOver = (counts.a + counts.c) * stopperSize + counts.o;
  const encUnder = (counts.b + counts.c) * stopperSize + counts.u;
  const obsPrimary = chosenPrimary === 'N' ? cards.N.length : cards.S.length;
  const obsOpposite = chosenPrimary === 'N' ? cards.S.length : cards.N.length;
  const obsOver = chosenPrimary === 'N' ? cards.W.length : cards.E.length;
  const obsUnder = chosenPrimary === 'N' ? cards.E.length : cards.W.length;
  return `obs P:${obsPrimary}/O:${obsOpposite}/over:${obsOver}/under:${obsUnder} enc P:${encPrimary}/O:${encOpposite}/over:${encOver}/under:${encUnder}`;
}

function explainSuit(
  input: PositionInverseInput['hands'],
  suit: Suit,
  slotIndex: number,
  totalSlots: number,
  header: string,
  threatCardIds?: string[],
  preferredPrimary?: 'N' | 'S'
): SuitInverseExplanation {
  const cards = suitRanks(input, suit);
  const inferred = inferSuit(input, suit, threatCardIds, preferredPrimary);
  const chosenPrimary: 'N' | 'S' | 'unknown' = preferredPrimary ?? inferred.primary;
  const winners = obviousWinners(cards);
  const stops = stopChecks(cards);
  const threats = stops
    .filter((c) => !winners.includes(`${c.seat}${c.rank}`))
    .map((c) => `${c.seat}${c.rank}`);
  const rawWithThreats = inferSuitAbstractionDetailed(
    { N: cards.N, E: cards.E, S: cards.S, W: cards.W },
    { suit, threatCardIds }
  ).result;
  const rawWithoutThreats = inferSuitAbstractionDetailed(
    { N: cards.N, E: cards.E, S: cards.S, W: cards.W },
    { suit, threatCardIds: [] }
  ).result;
  const threatCardTieBreakUsed = JSON.stringify(rawWithThreats) !== JSON.stringify(rawWithoutThreats);
  const lineageOuResolutionUsed =
    inferred.text !== prettyResult(inferred.raw) &&
    typeof inferred.raw !== 'string' &&
    inferred.raw.type === 'ambiguous' &&
    inferred.raw.candidates.length === 2 &&
    inferred.raw.candidates.includes('o') &&
    inferred.raw.candidates.includes('u');

  return {
    suit,
    slotIndex,
    totalSlots,
    header,
    cards,
    preferredPrimary: preferredPrimary ?? null,
    chosenPrimary,
    winners,
    threatCandidates: threats,
    stopChecks: stops,
    threatCardTieBreakUsed,
    lineageOuResolutionUsed,
    countSummary: countSummaryFor(inferred.text, chosenPrimary, cards),
    finalText: inferred.text,
    raw: inferred.raw
  };
}

export function inferPositionEncapsulationDetailed(input: PositionInverseInput): PositionInverseDetailed {
  const order = input.suitOrder && input.suitOrder.length > 0 ? input.suitOrder : DEFAULT_ORDER;
  const slotTexts: string[] = [];
  const primaryBySuit: Partial<Record<Suit, 'N' | 'S'>> = {};

  for (const suit of order) {
    const preferredPrimary = input.preferredPrimaryBySuit?.[suit];
    const inferred = inferSuit(input.hands, suit, input.threatCardIds, preferredPrimary);
    let effectivePrimary = inferred.primary;
    if (preferredPrimary) effectivePrimary = preferredPrimary;
    if (effectivePrimary === 'N' || effectivePrimary === 'S') primaryBySuit[suit] = effectivePrimary;
    slotTexts.push(inferred.text);
  }

  return {
    text: renderPositionEncapsulationSlots(order, slotTexts, input.turn),
    primaryBySuit
  };
}

export function inferPositionEncapsulation(input: PositionInverseInput): string {
  return inferPositionEncapsulationDetailed(input).text;
}

export function explainSuitInverse(
  cards: Record<Side, string[]>,
  suit: Suit,
  options?: { threatCardIds?: string[]; preferredPrimary?: 'N' | 'S' }
): SuitInverseExplanation {
  const hands = {
    N: { S: [], H: [], D: [], C: [] } as Record<Suit, string[]>,
    E: { S: [], H: [], D: [], C: [] } as Record<Suit, string[]>,
    S: { S: [], H: [], D: [], C: [] } as Record<Suit, string[]>,
    W: { S: [], H: [], D: [], C: [] } as Record<Suit, string[]>
  };
  hands.N[suit] = [...cards.N];
  hands.E[suit] = [...cards.E];
  hands.S[suit] = [...cards.S];
  hands.W[suit] = [...cards.W];
  return explainSuit(hands, suit, 1, 1, `[${suit.toLowerCase()}]`, options?.threatCardIds, options?.preferredPrimary);
}

export function explainPositionInverse(input: PositionInverseInput): PositionInverseExplanation {
  const detailed = inferPositionEncapsulationDetailed(input);
  const order = input.suitOrder && input.suitOrder.length > 0 ? input.suitOrder : DEFAULT_ORDER;
  const header = headerFromOrder(order);
  return {
    shortText: detailed.text,
    header,
    primaryBySuit: detailed.primaryBySuit,
    suits: order.map((suit, index) =>
      explainSuit(
        input.hands,
        suit,
        index + 1,
        order.length,
        header,
        input.threatCardIds,
        input.preferredPrimaryBySuit?.[suit]
      )
    )
  };
}
