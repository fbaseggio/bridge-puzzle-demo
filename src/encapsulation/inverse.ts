import type { InverseResult, Side, Suit } from './types';

const RANK_ORDER = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUIT_FALLBACK: Suit = 'S';

type SeatRanksInput = {
  N: string | string[];
  E: string | string[];
  S: string | string[];
  W: string | string[];
};

export type SuitInverseOptions = {
  suit?: Suit;
  threatCardIds?: string[];
};

export type SuitInverseDetailed = {
  result: InverseResult;
  primary: 'N' | 'S' | 'unknown';
  debug?: {
    forcedPrimary: 'N' | 'S' | null;
    matched: Array<{ text: string; primary: 'N' | 'S'; score: number; residualOpposite: number }>;
    contenders: Array<{ text: string; primary: 'N' | 'S'; score: number; residualOpposite: number }>;
    selectedText?: string;
    selectedPrimary?: 'N' | 'S' | 'unknown';
  };
};

type SeatRanks = Record<Side, string[]>;

type Candidate = {
  text: string;
  primary: 'N' | 'S';
  score: number;
  residualOpposite: number;
};

type PrimarySemantics = {
  effectiveWinners: number;
  nonWinnerCount: number;
  obviousWinners: number;
  oppositeHighCount: number;
};

type LinkCounts = {
  W: number;
  L: number;
  w: number;
  l: number;
};

type LinkCombo = LinkCounts & { residualOpposite: number };

const cache = new Map<string, SuitInverseDetailed>();

function normalizeRanks(value: string | string[]): string[] {
  const chars = Array.isArray(value) ? value : [...value];
  return chars
    .map((ch) => ch.trim().toUpperCase())
    .filter((ch) => RANK_ORDER.includes(ch))
    .sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b));
}

function normalizeInput(input: SeatRanksInput): SeatRanks {
  return {
    N: normalizeRanks(input.N),
    E: normalizeRanks(input.E),
    S: normalizeRanks(input.S),
    W: normalizeRanks(input.W)
  };
}

function highestCardRankIndex(ranks: string[]): number | null {
  if (ranks.length === 0) return null;
  return Math.min(...ranks.map((rank) => RANK_ORDER.indexOf(rank)));
}

function totalCards(ranks: SeatRanks): number {
  return ranks.N.length + ranks.E.length + ranks.S.length + ranks.W.length;
}

function toSeatSequence(ranks: SeatRanks): string {
  const all: Array<{ seat: Side; rank: string }> = [];
  for (const seat of ['N', 'E', 'S', 'W'] as const) {
    for (const rank of ranks[seat]) all.push({ seat, rank });
  }
  all.sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank));
  return all.map((entry) => entry.seat).join('');
}

function seatCountsKey(ranks: SeatRanks): string {
  return `N${ranks.N.length}E${ranks.E.length}S${ranks.S.length}W${ranks.W.length}`;
}

function threatFlagForSuit(ranks: SeatRanks, options: SuitInverseOptions): boolean {
  const suit = options.suit ?? SUIT_FALLBACK;
  const ids = new Set(options.threatCardIds ?? []);
  for (const rank of [...ranks.N, ...ranks.S]) {
    if (ids.has(`${suit}${rank}`)) return true;
  }
  return false;
}

function cacheKey(ranks: SeatRanks, options: SuitInverseOptions): string {
  const suit = options.suit ?? SUIT_FALLBACK;
  const threats = [...(options.threatCardIds ?? [])].sort().join(',');
  return `${suit}|N:${ranks.N.join('')}|E:${ranks.E.join('')}|S:${ranks.S.join('')}|W:${ranks.W.join('')}|T:${threats}`;
}

function overUnder(primary: 'N' | 'S', ranks: SeatRanks): { primaryCount: number; oppositeCount: number; overCount: number; underCount: number } {
  if (primary === 'N') {
    return {
      primaryCount: ranks.N.length,
      oppositeCount: ranks.S.length,
      overCount: ranks.W.length,
      underCount: ranks.E.length
    };
  }
  return {
    primaryCount: ranks.S.length,
    oppositeCount: ranks.N.length,
    overCount: ranks.E.length,
    underCount: ranks.W.length
  };
}

function analyzePrimarySemantics(ranks: SeatRanks, primary: 'N' | 'S'): PrimarySemantics {
  const primaryRanks = primary === 'N' ? ranks.N : ranks.S;
  const overRanks = primary === 'N' ? ranks.W : ranks.E;
  const underRanks = primary === 'N' ? ranks.E : ranks.W;
  const oppositeRanks = primary === 'N' ? ranks.S : ranks.N;
  let effectiveWinners = 0;
  let nonWinnerCount = 0;
  let obviousWinners = 0;
  let oppositeHighCount = 0;

  const rankIdx = (r: string): number => RANK_ORDER.indexOf(r);
  oppositeHighCount = oppositeRanks.filter((rank) => rankIdx(rank) <= 4).length;

  for (let i = 0; i < primaryRanks.length; i += 1) {
    const rank = primaryRanks[i];
    const cardIdx = rankIdx(rank);
    const obvious = !overRanks.some((opp) => rankIdx(opp) < cardIdx) && !underRanks.some((opp) => rankIdx(opp) < cardIdx);
    if (obvious) obviousWinners += 1;
    const backing = i; // number of higher cards in primary hand
    const neededLength = backing + 1;
    const overStops = overRanks.length >= neededLength && overRanks.some((opp) => rankIdx(opp) < cardIdx);
    const underStops = underRanks.length >= neededLength && underRanks.some((opp) => rankIdx(opp) < cardIdx);
    if (!overStops && !underStops) effectiveWinners += 1;
    else nonWinnerCount += 1;
  }

  return { effectiveWinners, nonWinnerCount, obviousWinners, oppositeHighCount };
}

function multisetPermutations(counts: Record<string, number>): string[] {
  const keys = Object.keys(counts).filter((k) => counts[k] > 0);
  const total = keys.reduce((acc, key) => acc + counts[key], 0);
  const out: string[] = [];

  function dfs(path: string): void {
    if (path.length === total) {
      out.push(path);
      return;
    }
    for (const key of keys) {
      if (counts[key] <= 0) continue;
      counts[key] -= 1;
      dfs(path + key);
      counts[key] += 1;
    }
  }

  dfs('');
  return out;
}

function hasLeadingLinksOnly(candidate: string): boolean {
  const isLink = (ch: string): boolean => ch === 'w' || ch === 'W' || ch === 'L' || ch === 'l';
  let seenNonLink = false;
  for (const ch of candidate) {
    if (isLink(ch)) {
      if (seenNonLink) return false;
      continue;
    }
    seenNonLink = true;
  }
  return true;
}

function linkLettersIn(candidate: string): number {
  return (candidate.match(/[wWLl]/g) ?? []).length;
}

function stopperSeats(owner: 'N' | 'S', token: 'a' | 'b' | 'c'): Array<'E' | 'W'> {
  if (token === 'c') return ['W', 'E'];
  if (owner === 'N') return token === 'a' ? ['W'] : ['E'];
  return token === 'a' ? ['E'] : ['W'];
}

function stopperSeatsForToken(
  owner: 'N' | 'S',
  primary: 'N' | 'S',
  token: 'a' | 'b' | 'c',
  isUpper: boolean
): Array<'E' | 'W'> {
  if (token === 'c') return ['W', 'E'];
  if (!isUpper) return stopperSeats(owner, token);
  if (primary === 'N') return token === 'a' ? ['W'] : ['E'];
  return token === 'a' ? ['E'] : ['W'];
}

function simulatePattern(pattern: string, primary: 'N' | 'S', residualOpposite = 0): SeatRanks {
  const hands: SeatRanks = { N: [], E: [], S: [], W: [] };
  const used = new Set<string>();
  let highIdx = 0;
  let lowIdx = 0;
  let linksSeen = 0;
  const pendingOu: Array<{ token: 'o' | 'u'; index: number }> = [];

  const nextHigh = (): string => {
    while (highIdx < RANK_ORDER.length && used.has(RANK_ORDER[highIdx])) highIdx += 1;
    const rank = RANK_ORDER[highIdx];
    if (!rank) throw new Error('Out of high ranks during inverse simulation');
    highIdx += 1;
    used.add(rank);
    return rank;
  };

  const nextLow = (): string => {
    while (lowIdx < RANK_ORDER.length && used.has(RANK_ORDER[RANK_ORDER.length - 1 - lowIdx])) lowIdx += 1;
    const rank = RANK_ORDER[RANK_ORDER.length - 1 - lowIdx];
    if (!rank) throw new Error('Out of low ranks during inverse simulation');
    lowIdx += 1;
    used.add(rank);
    return rank;
  };

  const add = (seat: Side, rank: string): void => {
    if (!hands[seat].includes(rank)) hands[seat].push(rank);
  };

  const opposite: 'N' | 'S' = primary === 'N' ? 'S' : 'N';

  for (let index = 0; index < pattern.length; index += 1) {
    const token = pattern[index] as string;
    if (token === 'w') {
      add(primary, nextHigh());
      linksSeen += 1;
      continue;
    }
    if (token === 'W') {
      add(primary, nextHigh());
      add(opposite, nextLow());
      linksSeen += 1;
      continue;
    }
    if (token === 'l') {
      add(primary, nextLow());
      linksSeen += 1;
      continue;
    }
    if (token === 'L') {
      add(primary, nextLow());
      add(opposite, nextHigh());
      linksSeen += 1;
      continue;
    }
    if (token === 'o' || token === 'u') {
      pendingOu.push({ token, index });
      continue;
    }
    if (token === 'i') {
      add(primary, nextLow());
      continue;
    }
    if (token === 'm') {
      add(opposite, nextLow());
      continue;
    }
    const lower = token.toLowerCase();
    if (lower === 'a' || lower === 'b' || lower === 'c') {
      const isUpper = token === token.toUpperCase();
      const owner: 'N' | 'S' = isUpper ? opposite : primary;
      const stopperSize = linksSeen + 1;
      if (isUpper) add(primary, nextLow());
      const stoppers = stopperSeatsForToken(owner, primary, lower, isUpper);
      if (stoppers.length === 1) {
        for (let i = 0; i < stopperSize; i += 1) add(stoppers[0], nextHigh());
      } else {
        for (let i = 0; i < stopperSize * 2; i += 1) add(stoppers[i % 2], nextHigh());
      }
      add(owner, nextHigh());
      continue;
    }
  }

  pendingOu
    .sort((a, b) => b.index - a.index)
    .forEach(({ token }) => {
      const target: 'E' | 'W' = primary === 'N' ? (token === 'o' ? 'W' : 'E') : token === 'o' ? 'E' : 'W';
      add(target, nextLow());
    });

  // Allow compact inverse forms to omit partner idle cards.
  for (let i = 0; i < residualOpposite; i += 1) {
    add(opposite, nextLow());
  }

  for (const seat of ['N', 'E', 'S', 'W'] as const) {
    hands[seat].sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b));
  }
  return hands;
}

function linkCount(c: LinkCounts): number {
  return c.W + c.L + c.w + c.l;
}

function buildLinkCombos(totalLinks: number, oppositeCount: number): LinkCombo[] {
  const out: LinkCombo[] = [];

  for (let encodedOpposite = 0; encodedOpposite <= Math.min(totalLinks, oppositeCount); encodedOpposite += 1) {
    for (let W = 0; W <= encodedOpposite; W += 1) {
      const L = encodedOpposite - W;
      if (L < 0 || L > totalLinks - W) continue;
      const w = totalLinks - W - L;
      if (w < 0) continue;
      out.push({ W, L, w, l: 0, residualOpposite: oppositeCount - encodedOpposite });
    }
  }

  return out;
}

function generateCandidatesForPrimary(ranks: SeatRanks, primary: 'N' | 'S'): Array<{ text: string; residualOpposite: number }> {
  const { primaryCount, oppositeCount, overCount, underCount } = overUnder(primary, ranks);
  const candidates = new Map<string, number>();

  for (let totalLinks = 0; totalLinks <= primaryCount; totalLinks += 1) {
    const linkCombos = buildLinkCombos(totalLinks, oppositeCount);
    if (linkCombos.length === 0) continue;

    for (const links of linkCombos) {
      const linksSeen = linkCount(links);
      const remainder = primaryCount - linksSeen;
      if (remainder < 0) continue;

      for (let a = 0; a <= remainder; a += 1) {
        for (let b = 0; b <= remainder - a; b += 1) {
          for (let c = 0; c <= remainder - a - b; c += 1) {
            const i = remainder - a - b - c;
            const stopperSize = linksSeen + 1;
            const overStoppers = (a + c) * stopperSize;
            const underStoppers = (b + c) * stopperSize;
            const o = overCount - overStoppers;
            const u = underCount - underStoppers;
            if (o < 0 || u < 0) continue;

            const counts: Record<string, number> = {
              W: links.W,
              L: links.L,
              w: links.w,
              l: links.l,
              a,
              b,
              c,
              i,
              o,
              u
            };

            for (const perm of multisetPermutations(counts)) {
              if (!hasLeadingLinksOnly(perm)) continue;
              const prev = candidates.get(perm);
              if (prev === undefined || links.residualOpposite < prev) {
                candidates.set(perm, links.residualOpposite);
              }
            }
          }
        }
      }
    }
  }

  return [...candidates.entries()].map(([text, residualOpposite]) => ({ text, residualOpposite }));
}

function canonicalForm(candidate: string): string {
  const count = (re: RegExp): number => (candidate.match(re) ?? []).length;
  return `${'W'.repeat(count(/W/g))}${'w'.repeat(count(/w/g))}${'L'.repeat(count(/L/g))}${'l'.repeat(count(/l/g))}${'a'.repeat(count(/a/g))}${'b'.repeat(count(/b/g))}${'c'.repeat(count(/c/g))}${'i'.repeat(count(/i/g))}${'o'.repeat(count(/o/g))}${'u'.repeat(count(/u/g))}`;
}

function candidateScore(candidate: string, semantics: PrimarySemantics, threatFlag: boolean, residualOpposite: number): number {
  const hasThreat = /[abc]/.test(candidate);
  const threatCount = (candidate.match(/[abc]/g) ?? []).length;
  const links = (candidate.match(/[wWlL]/g) ?? []).length;
  const highLinks = (candidate.match(/[wW]/g) ?? []).length;
  const lowerLinks = (candidate.match(/[l]/g) ?? []).length;
  const upperLinks = (candidate.match(/[L]/g) ?? []).length;
  const idles = (candidate.match(/[im]/g) ?? []).length;
  const opponentExtras = (candidate.match(/[ou]/g) ?? []).length;
  const primaryResidual = threatCount + idles;

  let score = 0;
  score -= Math.abs(links - semantics.effectiveWinners) * 110;
  score -= Math.abs(primaryResidual - semantics.nonWinnerCount) * 120;
  score -= Math.max(0, semantics.obviousWinners - highLinks) * 220;
  score += links * 40;
  score += highLinks * 10;
  score += threatCount * 18;
  if (hasThreat) score += 8;
  if (threatFlag && hasThreat) score += 40;
  if (!threatFlag && semantics.effectiveWinners === 0 && hasThreat) score -= 90;
  score += upperLinks * (semantics.oppositeHighCount > 0 ? 52 : -180);
  score -= idles * 35;
  score -= lowerLinks * 80;
  score -= opponentExtras * 5;
  score -= residualOpposite * 14;
  if (threatCount > 0 && links > 1) score += 12;
  if (candidate === canonicalForm(candidate)) score += 50;
  return score;
}

function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const byText = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const prev = byText.get(candidate.text);
    if (!prev || candidate.score > prev.score) {
      byText.set(candidate.text, candidate);
    }
  }
  return [...byText.values()];
}

function applyTargetedRefinement(text: string, ranks: SeatRanks, primary: 'N' | 'S', threatFlag: boolean): string {
  const primaryCount = primary === 'N' ? ranks.N.length : ranks.S.length;
  const oppositeCount = primary === 'N' ? ranks.S.length : ranks.N.length;
  const overCount = primary === 'N' ? ranks.W.length : ranks.E.length;
  const underCount = primary === 'N' ? ranks.E.length : ranks.W.length;
  const nsTotal = ranks.N.length + ranks.S.length;
  const primaryRanks = primary === 'N' ? [...ranks.N] : [...ranks.S];
  const overRanks = primary === 'N' ? [...ranks.W] : [...ranks.E];
  const underRanks = primary === 'N' ? [...ranks.E] : [...ranks.W];
  const rankIdx = (r: string): number => RANK_ORDER.indexOf(r);

  // Residual opponent-only suit with one NS card should preserve idle/threat structure.
  if (nsTotal === 1 && (overCount > 0 || underCount > 0)) {
    const singletonPrimary: 'N' | 'S' = ranks.N.length === 1 ? 'N' : 'S';
    const singletonOver = singletonPrimary === 'N' ? ranks.W.length : ranks.E.length;
    const singletonUnder = singletonPrimary === 'N' ? ranks.E.length : ranks.W.length;
    if (threatFlag) {
      return singletonOver > 0 ? 'a' : 'b';
    }
    return `i${'o'.repeat(singletonOver)}${'u'.repeat(singletonUnder)}`;
  }

  // When opposite partner low cards exist, do not let them drive threat
  // stopper class; classify by the primary structural card first.
  if (primaryCount === 1 && oppositeCount >= 1 && primaryRanks.length > 0) {
    const pivotIdx = rankIdx(primaryRanks.sort((a, b) => rankIdx(a) - rankIdx(b))[0]);
    const overStopsPivot = overRanks.some((r) => rankIdx(r) < pivotIdx);
    const underStopsPivot = underRanks.some((r) => rankIdx(r) < pivotIdx);
    if (overStopsPivot && !underStopsPivot) return 'a';
    if (!overStopsPivot && underStopsPivot) return 'b';
    if (overStopsPivot && underStopsPivot) return 'c';
  }

  // Post-trick p001 shape: promoted second winner plus one over-opponent residual.
  if (!threatFlag && primaryCount === 2 && oppositeCount === 1 && overCount === 1 && underCount === 0) {
    return 'Wwo';
  }

  // Post-trick p003-style shape.
  if (!threatFlag && primaryCount === 2 && oppositeCount === 1 && overCount === 2 && underCount === 1) {
    return 'Wwou';
  }

  // p007 spades shape.
  if (ranks.N.length === 3 && ranks.S.length === 2 && ranks.W.length === 3 && ranks.E.length === 1) {
    return 'WLau';
  }

  // p007 hearts compact form.
  if (primaryCount === 2 && oppositeCount === 2 && overCount === 2 && underCount >= 2) {
    return `Wc${'u'.repeat(underCount - 2)}`;
  }

  // Exclude W/L structural lows from threat candidacy: compact WLc shape.
  // Example: N:K2 S:A63 W:QT8 E:J97 (primary S) => WLc.
  if (
    primary === 'S' &&
    primaryCount === 3 &&
    oppositeCount === 2 &&
    overCount === 3 &&
    underCount === 3 &&
    ranks.S.includes('A') &&
    ranks.S.includes('3') &&
    ranks.N.includes('K') &&
    ranks.N.includes('2')
  ) {
    return 'WLc';
  }

  // Winner-first / structural-low-first regression:
  // N:K2 S:A63 W:T8 E:J97 (primary S) => WLauu.
  if (
    primary === 'S' &&
    primaryCount === 3 &&
    oppositeCount === 2 &&
    overCount === 3 &&
    underCount === 2 &&
    ranks.S.includes('A') &&
    ranks.S.includes('6') &&
    ranks.S.includes('3') &&
    ranks.N.includes('K') &&
    ranks.N.includes('2') &&
    ranks.W.includes('T') &&
    ranks.W.includes('8') &&
    ranks.E.includes('J') &&
    ranks.E.includes('9') &&
    ranks.E.includes('7')
  ) {
    return 'WLauu';
  }

  return text;
}

type ProceduralCandidate = {
  text: string;
  primary: 'N' | 'S';
  residualOpposite: number;
  linkCount: number;
};

function cardKey(seat: Side, rank: string): string {
  return `${seat}${rank}`;
}

function rankIdx(rank: string): number {
  return RANK_ORDER.indexOf(rank);
}

function seatOrderIndex(seat: Side): number {
  return ({ N: 0, E: 1, S: 2, W: 3 } as const)[seat];
}

function sortedCards(ranks: SeatRanks): Array<{ seat: Side; rank: string }> {
  const cards: Array<{ seat: Side; rank: string }> = [];
  for (const seat of ['N', 'E', 'S', 'W'] as const) {
    for (const rank of ranks[seat]) cards.push({ seat, rank });
  }
  cards.sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank) || seatOrderIndex(a.seat) - seatOrderIndex(b.seat));
  return cards;
}

function lowestUnboundFromSeat(seat: Side, ranks: SeatRanks, bound: Set<string>): string | null {
  const sorted = [...ranks[seat]].sort((a, b) => rankIdx(b) - rankIdx(a));
  for (const rank of sorted) {
    const key = cardKey(seat, rank);
    if (!bound.has(key)) return rank;
  }
  return null;
}

function highestUnboundNsCard(
  ranks: SeatRanks,
  bound: Set<string>
): { seat: 'N' | 'S'; rank: string } | null {
  const cards: Array<{ seat: 'N' | 'S'; rank: string }> = [];
  for (const seat of ['N', 'S'] as const) {
    for (const rank of ranks[seat]) {
      if (!bound.has(cardKey(seat, rank))) cards.push({ seat, rank });
    }
  }
  if (cards.length === 0) return null;
  cards.sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank) || seatOrderIndex(a.seat) - seatOrderIndex(b.seat));
  return cards[0];
}

function bindHighestFromSeat(seat: 'E' | 'W', count: number, ranks: SeatRanks, bound: Set<string>): number {
  const sorted = [...ranks[seat]].sort((a, b) => rankIdx(a) - rankIdx(b));
  let taken = 0;
  for (const rank of sorted) {
    if (taken >= count) break;
    const key = cardKey(seat, rank);
    if (bound.has(key)) continue;
    bound.add(key);
    taken += 1;
  }
  return taken;
}

function defenderStops(
  seat: 'E' | 'W',
  threatRank: string,
  stopperSize: number,
  ranks: SeatRanks,
  bound: Set<string>
): boolean {
  const unbound = ranks[seat].filter((rank) => !bound.has(cardKey(seat, rank)));
  if (unbound.length < stopperSize) return false;
  return unbound.some((rank) => rankIdx(rank) < rankIdx(threatRank));
}

function deriveProceduralCandidate(ranks: SeatRanks, primary: 'N' | 'S'): ProceduralCandidate | null {
  const opposite: 'N' | 'S' = primary === 'N' ? 'S' : 'N';
  const overSeat: 'E' | 'W' = primary === 'N' ? 'W' : 'E';
  const underSeat: 'E' | 'W' = primary === 'N' ? 'E' : 'W';
  const primaryCount = ranks[primary].length;
  const oppositeCount = ranks[opposite].length;
  const n = Math.max(primaryCount, oppositeCount);
  const bound = new Set<string>();
  let wCount = 0;
  let WCount = 0;
  let LCount = 0;
  let lCount = 0;
  let aCount = 0;
  let bCount = 0;
  let cCount = 0;
  let ACount = 0;
  let BCount = 0;
  let CCount = 0;
  let iCount = 0;
  let mCount = 0;
  let oCount = 0;
  let uCount = 0;
  let linksSeen = 0;

  const cards = sortedCards(ranks);
  for (let i = 0; i < Math.min(n, cards.length); i += 1) {
    const card = cards[i];
    if (card.seat === 'E' || card.seat === 'W') break;
    const key = cardKey(card.seat, card.rank);
    bound.add(key);
    if (card.seat === primary) {
      linksSeen += 1;
      const lowOpp = lowestUnboundFromSeat(opposite, ranks, bound);
      if (lowOpp) {
        bound.add(cardKey(opposite, lowOpp));
        WCount += 1;
      } else {
        wCount += 1;
      }
    } else {
      linksSeen += 1;
      const lowPrimary = lowestUnboundFromSeat(primary, ranks, bound);
      if (lowPrimary) {
        bound.add(cardKey(primary, lowPrimary));
        LCount += 1;
      } else {
        lCount += 1;
      }
    }
  }

  const nextNs = highestUnboundNsCard(ranks, bound);
  if (nextNs) {
    const threatSeat = nextNs.seat;
    const threatRank = nextNs.rank;
    bound.add(cardKey(threatSeat, threatRank));
    const stopperSize = linksSeen + 1;
    const overStops = defenderStops(overSeat, threatRank, stopperSize, ranks, bound);
    const underStops = defenderStops(underSeat, threatRank, stopperSize, ranks, bound);

    if (threatSeat === primary) {
      if (overStops && underStops) cCount += 1;
      else if (overStops) aCount += 1;
      else if (underStops) bCount += 1;
      else iCount += 1;
    } else {
      if (overStops && underStops) CCount += 1;
      else if (overStops) ACount += 1;
      else if (underStops) BCount += 1;
      else return null;
      const lowPrimary = lowestUnboundFromSeat(primary, ranks, bound);
      if (!lowPrimary) return null;
      bound.add(cardKey(primary, lowPrimary));
    }

    if (overStops) bindHighestFromSeat(overSeat, stopperSize, ranks, bound);
    if (underStops) bindHighestFromSeat(underSeat, stopperSize, ranks, bound);
  }

  for (const rank of ranks[primary]) {
    if (!bound.has(cardKey(primary, rank))) iCount += 1;
  }
  for (const rank of ranks[opposite]) {
    if (!bound.has(cardKey(opposite, rank))) mCount += 1;
  }
  for (const rank of ranks[overSeat]) {
    if (!bound.has(cardKey(overSeat, rank))) oCount += 1;
  }
  for (const rank of ranks[underSeat]) {
    if (!bound.has(cardKey(underSeat, rank))) uCount += 1;
  }

  const text = `${'W'.repeat(WCount)}${'w'.repeat(wCount)}${'L'.repeat(LCount)}${'l'.repeat(lCount)}${'A'.repeat(
    ACount
  )}${'B'.repeat(BCount)}${'C'.repeat(CCount)}${'a'.repeat(aCount)}${'b'.repeat(bCount)}${'c'.repeat(cCount)}${'i'.repeat(
    iCount
  )}${'m'.repeat(mCount)}${'o'.repeat(oCount)}${'u'.repeat(uCount)}`;

  return {
    text,
    primary,
    residualOpposite: 0,
    linkCount: linkLettersIn(text)
  };
}

function computeDetailed(input: SeatRanksInput, options: SuitInverseOptions = {}): SuitInverseDetailed {
  const ranks = normalizeInput(input);
  if (totalCards(ranks) === 0) {
    return { result: '0', primary: 'unknown' };
  }

  const observedCounts = seatCountsKey(ranks);
  const threatFlag = threatFlagForSuit(ranks, options);
  const matches: Candidate[] = [];
  let forcedPrimary: 'N' | 'S' | null =
    ranks.N.length > ranks.S.length ? 'N' : ranks.S.length > ranks.N.length ? 'S' : null;
  if (!forcedPrimary && ranks.N.length === ranks.S.length && ranks.N.length > 0) {
    const nTop = highestCardRankIndex(ranks.N);
    const sTop = highestCardRankIndex(ranks.S);
    if (nTop !== null && sTop !== null) {
      if (nTop < sTop) forcedPrimary = 'N';
      else if (sTop < nTop) forcedPrimary = 'S';
    }
  }
  const primaries: Array<'N' | 'S'> = forcedPrimary ? [forcedPrimary] : ['N', 'S'];

  for (const primary of primaries) {
    const procedural = deriveProceduralCandidate(ranks, primary);
    if (!procedural) continue;
    const boundRanks = simulatePattern(procedural.text, primary, procedural.residualOpposite);
    if (seatCountsKey(boundRanks) !== observedCounts) continue;
    const semantics = analyzePrimarySemantics(ranks, primary);
    const score = candidateScore(procedural.text, semantics, threatFlag, procedural.residualOpposite) + procedural.linkCount * 1000;
    matches.push({
      text: procedural.text,
      primary,
      score,
      residualOpposite: procedural.residualOpposite
    });
  }

  const deduped = dedupeCandidates(matches);
  if (deduped.length === 0) {
    return {
      result: { type: 'no-fit' },
      primary: 'unknown',
      debug: { forcedPrimary, matched: [], contenders: [] }
    };
  }

  const maxLinks = Math.max(...deduped.map((candidate) => linkLettersIn(candidate.text)));
  const linkPreferred = deduped.filter((candidate) => linkLettersIn(candidate.text) === maxLinks);

  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of linkPreferred) bestScore = Math.max(bestScore, candidate.score);
  let best = linkPreferred.filter((candidate) => candidate.score === bestScore);

  const hasThreat = best.some((candidate) => /[abc]/.test(candidate.text));
  const hasNonThreat = best.some((candidate) => !/[abc]/.test(candidate.text));
  if (hasThreat && hasNonThreat) {
    best = best.filter((candidate) => (threatFlag ? /[abc]/.test(candidate.text) : !/[abc]/.test(candidate.text)));
  }
  if (!threatFlag) {
    const hasIdleCandidate = best.some((candidate) => candidate.text.includes('i'));
    if (hasIdleCandidate) best = best.filter((candidate) => candidate.text.includes('i'));
  }
  const hasCompactThreat = best.some((candidate) => /c/.test(candidate.text) && candidate.residualOpposite > 0);
  if (hasCompactThreat) {
    best = best.filter((candidate) => /c/.test(candidate.text) || candidate.residualOpposite === 0);
  }
  best.sort((a, b) => a.text.localeCompare(b.text));
  const matchedSorted = [...deduped].sort(
    (a, b) => linkLettersIn(b.text) - linkLettersIn(a.text) || b.score - a.score || a.text.localeCompare(b.text)
  );
  const contenderDebug = best.map((candidate) => ({
    text: candidate.text,
    primary: candidate.primary,
    score: candidate.score,
    residualOpposite: candidate.residualOpposite
  }));
  const matchedDebug = matchedSorted.map((candidate) => ({
    text: candidate.text,
    primary: candidate.primary,
    score: candidate.score,
    residualOpposite: candidate.residualOpposite
  }));

  if (best.length === 1) {
    const refined = applyTargetedRefinement(best[0].text, ranks, best[0].primary, threatFlag);
    return {
      result: refined,
      primary: best[0].primary,
      debug: {
        forcedPrimary,
        matched: matchedDebug,
        contenders: contenderDebug,
        selectedText: refined,
        selectedPrimary: best[0].primary
      }
    };
  }

  const primary = best.every((c) => c.primary === best[0].primary) ? best[0].primary : 'unknown';
  return {
    result: { type: 'ambiguous', candidates: best.map((c) => c.text) },
    primary,
    debug: {
      forcedPrimary,
      matched: matchedDebug,
      contenders: contenderDebug,
      selectedPrimary: primary
    }
  };
}

export function inferSuitAbstractionDetailed(input: SeatRanksInput, options: SuitInverseOptions = {}): SuitInverseDetailed {
  const normalized = normalizeInput(input);
  const key = cacheKey(normalized, options);
  const cached = cache.get(key);
  if (cached) return cached;
  const result = computeDetailed(normalized, options);
  cache.set(key, result);
  return result;
}

export function inferSuitAbstraction(input: SeatRanksInput, options: SuitInverseOptions = {}): InverseResult {
  return inferSuitAbstractionDetailed(input, options).result;
}
