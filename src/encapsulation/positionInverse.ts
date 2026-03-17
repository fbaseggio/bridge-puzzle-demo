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
  debug?: {
    forcedPrimary: 'N' | 'S' | null;
    matched: Array<{ text: string; primary: 'N' | 'S'; score: number; residualOpposite: number }>;
    contenders: Array<{ text: string; primary: 'N' | 'S'; score: number; residualOpposite: number }>;
    selectedText?: string;
    selectedPrimary?: 'N' | 'S' | 'unknown';
  };
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
  structuralLows: string[];
  threatCandidates: string[];
  bindingLabels: string[];
  stopChecks: SuitStopExplanation[];
  threatCardTieBreakUsed: boolean;
  lineageOuResolutionUsed: boolean;
  countSummary: string;
  finalText: string;
  raw: InverseResult;
  candidateScores: Array<{ text: string; primary: 'N' | 'S'; score: number; residualOpposite: number }>;
  contenderScores: Array<{ text: string; primary: 'N' | 'S'; score: number; residualOpposite: number }>;
  selectedByScorer?: { text?: string; primary?: 'N' | 'S' | 'unknown' };
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
  turn: Side,
  splitIndex?: number
): string {
  const normalizedSplit =
    typeof splitIndex === 'number'
      ? Math.max(0, Math.min(order.length, Math.floor(splitIndex)))
      : Math.ceil(order.length / 2);
  const leftTarget = normalizedSplit;
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
    raw: result,
    debug: detailed.debug
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

function structuralLowsFor(text: string, chosenPrimary: 'N' | 'S' | 'unknown', cards: Record<Side, string[]>): string[] {
  if (chosenPrimary === 'unknown' || text.startsWith('{')) return [];
  const wCount = (text.match(/W/g) ?? []).length;
  const lCount = (text.match(/L/g) ?? []).length;
  if (wCount === 0 && lCount === 0) return [];

  const primarySeat: 'N' | 'S' = chosenPrimary;
  const oppositeSeat: 'N' | 'S' = primarySeat === 'N' ? 'S' : 'N';
  const lows: string[] = [];
  const sortLow = (ranks: string[]): string[] => [...ranks].sort((a, b) => rankIndex(b) - rankIndex(a));

  if (wCount > 0) {
    const oppositeLows = sortLow(cards[oppositeSeat]).slice(0, wCount);
    oppositeLows.forEach((rank) => lows.push(`${oppositeSeat}${rank}`));
  }
  if (lCount > 0) {
    const primaryLows = sortLow(cards[primarySeat]).slice(0, lCount);
    primaryLows.forEach((rank) => lows.push(`${primarySeat}${rank}`));
  }
  return [...new Set(lows)];
}

function bindingLabelsFor(
  text: string,
  chosenPrimary: 'N' | 'S' | 'unknown',
  cards: Record<Side, string[]>,
  structuralLows: string[],
  threats: string[]
): string[] {
  if (chosenPrimary === 'unknown' || text.startsWith('{') || text === '0') return [];
  const labels: string[] = [];
  const used = new Set<string>();
  const primary: 'N' | 'S' = chosenPrimary;
  const opposite: 'N' | 'S' = primary === 'N' ? 'S' : 'N';
  const oppRanks = [...cards.E, ...cards.W];
  const primaryRanks = [...cards[primary]].sort((a, b) => rankIndex(a) - rankIndex(b));
  const oppositeRanks = [...cards[opposite]].sort((a, b) => rankIndex(a) - rankIndex(b));
  const obviousPrimary = primaryRanks.filter((rank) => !oppRanks.some((r) => rankIndex(r) < rankIndex(rank)));
  const obviousOpposite = oppositeRanks.filter((rank) => !oppRanks.some((r) => rankIndex(r) < rankIndex(rank)));
  const wCount = (text.match(/W/g) ?? []).length + (text.match(/w/g) ?? []).length;
  const WCount = (text.match(/W/g) ?? []).length;
  const lCount = (text.match(/L/g) ?? []).length + (text.match(/l/g) ?? []).length;
  const LCount = (text.match(/L/g) ?? []).length;

  const oppositeLowRanks = [...cards[opposite]].sort((a, b) => rankIndex(b) - rankIndex(a));
  const primaryLowRanks = [...cards[primary]].sort((a, b) => rankIndex(b) - rankIndex(a));

  for (let i = 0; i < wCount; i += 1) {
    const rank = obviousPrimary[i];
    if (!rank) continue;
    const card = `${primary}${rank}`;
    labels.push(`${card}->w${i + 1}`);
    used.add(card);
    if (i < WCount) {
      const low = oppositeLowRanks.find((r) => !used.has(`${opposite}${r}`));
      if (low) {
        const lowCard = `${opposite}${low}`;
        labels.push(`${lowCard}->W${i + 1}-low`);
        used.add(lowCard);
      }
    }
  }

  for (let i = 0; i < lCount; i += 1) {
    const rank = obviousOpposite[i];
    if (!rank) continue;
    const card = `${opposite}${rank}`;
    labels.push(`${card}->l${i + 1}`);
    used.add(card);
    if (i < LCount) {
      const low = primaryLowRanks.find((r) => !used.has(`${primary}${r}`));
      if (low) {
        const lowCard = `${primary}${low}`;
        labels.push(`${lowCard}->L${i + 1}-low`);
        used.add(lowCard);
      }
    }
  }

  const letters = [...text].filter((ch) => ['a', 'b', 'c', 'i', 'm', 'o', 'u'].includes(ch));
  const counters: Record<string, number> = { a: 0, b: 0, c: 0, i: 0, m: 0, o: 0, u: 0 };
  const structuralSet = new Set(structuralLows);
  const threatSet = new Set(threats);
  const remainingPrimary = [...cards[primary]]
    .map((rank) => `${primary}${rank}`)
    .filter((card) => !used.has(card) && !structuralSet.has(card))
    .sort((a, b) => rankIndex(a.slice(1)) - rankIndex(b.slice(1)));
  const remainingWest = [...cards.W]
    .map((rank) => `W${rank}`)
    .filter((card) => !used.has(card))
    .sort((a, b) => rankIndex(a.slice(1)) - rankIndex(b.slice(1)));
  const remainingEast = [...cards.E]
    .map((rank) => `E${rank}`)
    .filter((card) => !used.has(card))
    .sort((a, b) => rankIndex(a.slice(1)) - rankIndex(b.slice(1)));
  const remainingOpposite = [...cards[opposite]]
    .map((rank) => `${opposite}${rank}`)
    .filter((card) => !used.has(card))
    .sort((a, b) => rankIndex(a.slice(1)) - rankIndex(b.slice(1)));

  for (const token of letters) {
    counters[token] += 1;
    if (token === 'a' || token === 'b' || token === 'c' || token === 'i') {
      const card =
        remainingPrimary.find((c) => (token === 'i' ? !threatSet.has(c) : threatSet.has(c))) ??
        remainingPrimary.shift();
      if (card) {
        labels.push(`${card}->${token}${counters[token]}`);
        used.add(card);
      }
      continue;
    }
    if (token === 'm') {
      const card = remainingOpposite.shift();
      if (card) {
        labels.push(`${card}->m${counters[token]}`);
        used.add(card);
      }
      continue;
    }
    if (token === 'o' || token === 'u') {
      const pool =
        token === 'o'
          ? (chosenPrimary === 'N' ? remainingWest : remainingEast)
          : (chosenPrimary === 'N' ? remainingEast : remainingWest);
      const fallback = token === 'o' ? remainingEast : remainingWest;
      const card = pool.shift() ?? fallback.shift();
      if (card) {
        labels.push(`${card}->${token}${counters[token]}`);
        used.add(card);
      }
    }
  }
  return labels;
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
    m: (text.match(/m/g) ?? []).length,
    o: (text.match(/o/g) ?? []).length,
    u: (text.match(/u/g) ?? []).length
  };
  const links = counts.W + counts.L + counts.w + counts.l;
  const stopperSize = links + 1;
  const encPrimary = counts.W + counts.L + counts.w + counts.l + counts.a + counts.b + counts.c + counts.i;
  const encOpposite = counts.W + counts.L + counts.m;
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
  const structuralLows = structuralLowsFor(inferred.text, chosenPrimary, cards);
  const structuralSet = new Set(structuralLows);
  const stops = stopChecks(cards);
  const threats = stops
    .filter((c) => !winners.includes(`${c.seat}${c.rank}`) && !structuralSet.has(`${c.seat}${c.rank}`))
    .map((c) => `${c.seat}${c.rank}`);
  const bindingLabels = bindingLabelsFor(inferred.text, chosenPrimary, cards, structuralLows, threats);
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
    structuralLows,
    threatCandidates: threats,
    bindingLabels,
    stopChecks: stops,
    threatCardTieBreakUsed,
    lineageOuResolutionUsed,
    countSummary: countSummaryFor(inferred.text, chosenPrimary, cards),
    finalText: inferred.text,
    raw: inferred.raw,
    candidateScores: inferred.debug?.matched ?? [],
    contenderScores: inferred.debug?.contenders ?? [],
    selectedByScorer:
      inferred.debug?.selectedText || inferred.debug?.selectedPrimary
        ? { text: inferred.debug?.selectedText, primary: inferred.debug?.selectedPrimary }
        : undefined
  };
}

export function inferPositionEncapsulationDetailed(input: PositionInverseInput): PositionInverseDetailed {
  const order = input.suitOrder && input.suitOrder.length > 0 ? input.suitOrder : DEFAULT_ORDER;
  const inferredBySuit = new Map<Suit, SuitInference & { effectivePrimary: 'N' | 'S' | 'unknown' }>();
  const primaryBySuit: Partial<Record<Suit, 'N' | 'S'>> = {};

  for (const suit of order) {
    const preferredPrimary = input.preferredPrimaryBySuit?.[suit];
    const inferred = inferSuit(input.hands, suit, input.threatCardIds, preferredPrimary);
    let effectivePrimary = inferred.primary;
    if (preferredPrimary) effectivePrimary = preferredPrimary;
    inferredBySuit.set(suit, { ...inferred, effectivePrimary });
    if (effectivePrimary === 'N' || effectivePrimary === 'S') {
      primaryBySuit[suit] = effectivePrimary;
    }
  }

  const northSuits: Suit[] = [];
  const southSuits: Suit[] = [];
  for (const suit of order) {
    const effectivePrimary = inferredBySuit.get(suit)?.effectivePrimary ?? 'unknown';
    if (effectivePrimary === 'S') southSuits.push(suit);
    else northSuits.push(suit);
  }

  const groupedOrder = [...northSuits, ...southSuits];
  const slotTexts = groupedOrder.map((suit) => inferredBySuit.get(suit)?.text ?? '{no-fit}');

  return {
    text: renderPositionEncapsulationSlots(groupedOrder, slotTexts, input.turn, northSuits.length),
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
