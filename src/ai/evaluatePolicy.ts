import type { Hand, Play, Policy, Rank, RngState, Seat, State, Suit } from '../core';
import { computeDiscardTiers, type DiscardTiers, getIdleThreatThresholdRank } from './defenderDiscard';
import { parseCardId, toCardId, type CardId, type DefenderLabels, type ResourceContext, type ThreatContext } from './threatModel';
import { classInfoForCard } from '../core/equivalence';
import { applyStrictDdFilter, buildCanonicalPositionSignature, type DdPolicyTrace } from './ddPolicy';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const SEAT_ORDER: Seat[] = ['N', 'E', 'S', 'W'];
const RANK_STRENGTH: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};

function nextSeat(seat: Seat): Seat {
  const idx = SEAT_ORDER.indexOf(seat);
  return SEAT_ORDER[(idx + 1) % SEAT_ORDER.length];
}

function rankOfCardId(cardId: CardId): Rank {
  return parseCardId(cardId).rank;
}

function chooseLowestByRank(cards: CardId[]): CardId | null {
  if (cards.length === 0) return null;
  let best = cards[0];
  for (const card of cards.slice(1)) {
    if (RANK_STRENGTH[rankOfCardId(card)] < RANK_STRENGTH[rankOfCardId(best)]) best = card;
  }
  return best;
}

export type EvaluatePolicyInput = {
  policy: Policy;
  seat: 'E' | 'W';
  problemId?: string;
  contractStrain?: Suit | 'NT';
  debugPositionIndex?: number;
  debugTrickIndex?: number;
  hands: Record<Seat, Hand>;
  trick: Play[];
  threat: ThreatContext | null;
  resource?: ResourceContext | null;
  threatLabels: DefenderLabels | null;
  rng: RngState;
};

export type DdDecisionTrace = {
  pos: number | '-';
  trick: number | '-';
  seat: 'E' | 'W';
  sig: string;
  legal: CardId[];
  base: CardId[];
  lookup: boolean;
  found: boolean;
  path: 'intersection' | 'dd-fallback' | 'base-fallback' | 'disabled';
  optimal?: CardId[];
  after: CardId[];
  chosen: CardId | '-';
};

export type EvaluatePolicyOutput = {
  chosenCardId: CardId | null;
  chosenBucket?: string;
  bucketCards?: CardId[];
  policyClassByCard?: Record<string, string>;
  tierBuckets?: Partial<Record<'tier3a' | 'tier3b' | 'tier3c' | 'tier4a' | 'tier4b' | 'tier4c', CardId[]>>;
  discardTiers?: DiscardTiers;
  ddPolicy?: DdPolicyTrace;
  ddTrace?: DdDecisionTrace;
  rngBefore: RngState;
  rngAfter: RngState;
};

function randomUnit(rng: RngState): [number, RngState] {
  const x0 = (rng.seed + Math.imul(rng.counter, 0x9e3779b9)) >>> 0;
  let x = x0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return [x / 0x100000000, { seed: rng.seed >>> 0, counter: rng.counter + 1 }];
}

function pickRandomIndex(length: number, rng: RngState): [number, RngState] {
  const [unit, next] = randomUnit(rng);
  const raw = Math.floor(unit * length);
  const idx = Number.isFinite(raw) && raw >= 0 && raw < length ? raw : 0;
  return [idx, next];
}

function legalPlaysForSeat(hands: Record<Seat, Hand>, seat: Seat, leadSuit: Suit | null): Play[] {
  const hand = hands[seat];
  const leadRanks = leadSuit ? (hand[leadSuit] ?? []) : [];
  const candidateSuits = leadSuit && leadRanks.length > 0 ? [leadSuit] : SUITS;
  const plays: Play[] = [];
  for (const suit of candidateSuits) {
    for (const rank of hand[suit] ?? []) {
      plays.push({ seat, suit, rank });
    }
  }
  return plays;
}

function chooseUniformLegalCardId(hands: Record<Seat, Hand>, seat: Seat, leadSuit: Suit | null, rng: RngState): [CardId | null, RngState] {
  const legal = legalPlaysForSeat(hands, seat, leadSuit);
  if (legal.length === 0) return [null, rng];
  const [idx, nextRng] = pickRandomIndex(legal.length, rng);
  const selected = legal[idx] ?? legal[0];
  return [toCardId(selected.suit, selected.rank) as CardId, nextRng];
}

function buildPolicyClassByCard(
  hands: Record<Seat, Hand>,
  seat: 'E' | 'W',
  chosenBucket: string | undefined,
  bucketCards: CardId[] | undefined
): Record<string, string> | undefined {
  if (!bucketCards || bucketCards.length === 0) return undefined;
  const out: Record<string, string> = {};
  const stateForEq = { hands } as unknown as State;
  for (const card of bucketCards) {
    const defaultClass = classInfoForCard(stateForEq, seat, card).classId;
    if (!chosenBucket || !chosenBucket.startsWith('tier')) {
      out[card] = defaultClass;
    } else if (chosenBucket.startsWith('tier1')) {
      out[card] = 'idle:tier1';
    } else if (chosenBucket === 'tier2a' || chosenBucket === 'tier2b') {
      out[card] = `semiIdle:${card[0]}`;
    } else if (chosenBucket.startsWith('tier3') || chosenBucket.startsWith('tier4')) {
      out[card] = `busy:${card[0]}`;
    } else {
      out[card] = `other:${card[0]}`;
    }
  }
  return out;
}

export function evaluatePolicy(input: EvaluatePolicyInput): EvaluatePolicyOutput {
  const { policy, seat, hands, trick, threat, resource, threatLabels } = input;
  const leadSuit = trick[0]?.suit ?? null;
  const rngBefore = { seed: input.rng.seed >>> 0, counter: input.rng.counter };
  let rngAfter = { ...rngBefore };
  const contractStrain = input.contractStrain ?? 'NT';
  const signature = buildCanonicalPositionSignature({ contractStrain, seat, hands, trick });
  const ddSource = policy.ddSource ?? 'runtime';
  const applyDdFilter = (
    candidates: CardId[],
    legalUniverse?: CardId[]
  ): {
    candidates: CardId[];
    trace?: DdPolicyTrace;
    lookup: boolean;
    found: boolean;
    path: 'intersection' | 'dd-fallback' | 'base-fallback' | 'disabled';
  } => {
    if (ddSource !== 'runtime') {
      return {
        candidates: [...candidates],
        trace: undefined,
        lookup: false,
        found: false,
        path: 'disabled'
      };
    }
    const filtered = applyStrictDdFilter(input.problemId, signature, candidates, legalUniverse);
    if (!filtered.trace) {
      return {
        candidates: filtered.candidates,
        trace: undefined,
        lookup: true,
        found: false,
        path: 'base-fallback'
      };
    }
    return {
      candidates: filtered.candidates,
      trace: filtered.trace,
      lookup: true,
      found: true,
      path: filtered.trace.path
    };
  };

  const buildDdDecisionTrace = (
    legal: CardId[],
    base: CardId[],
    filtered: ReturnType<typeof applyDdFilter>,
    chosen: CardId | null
  ): DdDecisionTrace => ({
    pos: typeof input.debugPositionIndex === 'number' ? input.debugPositionIndex : '-',
    trick: typeof input.debugTrickIndex === 'number' ? input.debugTrickIndex : '-',
    seat,
    sig: signature,
    legal: [...legal],
    base: [...base],
    lookup: filtered.lookup,
    found: filtered.found,
    path: filtered.path,
    optimal: filtered.trace?.optimalMoves ? [...filtered.trace.optimalMoves] : undefined,
    after: [...filtered.candidates],
    chosen: chosen ?? '-'
  });

  if (policy.kind === 'randomLegal') {
    const legal = legalPlaysForSeat(hands, seat, leadSuit);
    const legalCardIds = legal.map((p) => toCardId(p.suit, p.rank) as CardId);
    const ddFiltered = applyDdFilter(legalCardIds, legalCardIds);
    const [idx, nextRng] = pickRandomIndex(ddFiltered.candidates.length, rngAfter);
    rngAfter = nextRng;
    const chosenCardId = ddFiltered.candidates[idx] ?? ddFiltered.candidates[0] ?? null;
    const chosenBucket = 'legal';
    const bucketCards = [...ddFiltered.candidates];
    return {
      chosenCardId,
      chosenBucket,
      bucketCards,
      policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, bucketCards),
      ddPolicy: ddFiltered.trace,
      ddTrace: buildDdDecisionTrace(legalCardIds, legalCardIds, ddFiltered, chosenCardId),
      rngBefore,
      rngAfter
    };
  }

  if (leadSuit === null) {
    const legal = legalPlaysForSeat(hands, seat, null);
    const legalCardIds = legal.map((p) => toCardId(p.suit, p.rank) as CardId);
    const ddFiltered = applyDdFilter(legalCardIds, legalCardIds);
    const [idx, nextRng] = pickRandomIndex(ddFiltered.candidates.length, rngAfter);
    rngAfter = nextRng;
    const chosenCardId = ddFiltered.candidates[idx] ?? ddFiltered.candidates[0] ?? null;
    const chosenBucket = 'lead:none';
    const bucketCards = [...ddFiltered.candidates];
    return {
      chosenCardId,
      chosenBucket,
      bucketCards,
      policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, bucketCards),
      ddPolicy: ddFiltered.trace,
      ddTrace: buildDdDecisionTrace(legalCardIds, legalCardIds, ddFiltered, chosenCardId),
      rngBefore,
      rngAfter
    };
  }

  const inSuit = legalPlaysForSeat(hands, seat, leadSuit);
  if (hands[seat][leadSuit].length > 0) {
    const inSuitCardIds = inSuit.map((p) => toCardId(p.suit, p.rank) as CardId);

    // Rule 1: when all in-suit options are idle, win as cheaply as possible if we can.
    if (threatLabels) {
      const idleCards = inSuitCardIds.filter((cardId) => threatLabels[seat].idle.has(cardId));
      if (idleCards.length > 0 && idleCards.length === inSuitCardIds.length) {
        const ddOnIdle = applyDdFilter(idleCards, inSuitCardIds);
        if (ddOnIdle.trace?.bound) {
          const chosenCardId = chooseLowestByRank(ddOnIdle.candidates);
          if (chosenCardId) {
            const chosenBucket = 'follow:idle-cheap-win';
            return {
            chosenCardId,
            chosenBucket,
            bucketCards: [...ddOnIdle.candidates],
            policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, ddOnIdle.candidates),
            ddPolicy: ddOnIdle.trace,
            ddTrace: buildDdDecisionTrace(inSuitCardIds, idleCards, ddOnIdle, chosenCardId),
            rngBefore,
            rngAfter
          };
          }
        }
        const highestSoFar = trick.reduce((max, play) => {
          if (play.suit !== leadSuit) return max;
          return Math.max(max, RANK_STRENGTH[play.rank]);
        }, 0);
        const winningIdle = idleCards.filter((cardId) => RANK_STRENGTH[rankOfCardId(cardId)] > highestSoFar);
        const ddFiltered = applyDdFilter(winningIdle);
        const chosenCardId = chooseLowestByRank(ddFiltered.candidates);
        if (chosenCardId) {
          const chosenBucket = 'follow:idle-cheap-win';
          return {
            chosenCardId,
            chosenBucket,
            bucketCards: [...ddFiltered.candidates],
            policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, ddFiltered.candidates),
            ddPolicy: ddFiltered.trace,
            ddTrace: buildDdDecisionTrace(inSuitCardIds, winningIdle, ddFiltered, chosenCardId),
            rngBefore,
            rngAfter
          };
        }
      }
    }

    // Rule 2: second hand busy follow; if partner cannot beat third-hand threat, cover it cheaply now.
    if (threat && threatLabels && trick.length === 1) {
      const busyCards = inSuitCardIds.filter((cardId) => threatLabels[seat].busy.has(cardId));
      if (busyCards.length > 0 && busyCards.length === inSuitCardIds.length) {
        const ddOnBusy = applyDdFilter(busyCards, inSuitCardIds);
        if (ddOnBusy.trace?.bound) {
          const chosenCardId = chooseLowestByRank(ddOnBusy.candidates);
          if (chosenCardId) {
            const chosenBucket = 'follow:busy-protect-threat';
            return {
                chosenCardId,
                chosenBucket,
                bucketCards: [...ddOnBusy.candidates],
                policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, ddOnBusy.candidates),
                ddPolicy: ddOnBusy.trace,
                ddTrace: buildDdDecisionTrace(inSuitCardIds, busyCards, ddOnBusy, chosenCardId),
                rngBefore,
                rngAfter
              };
          }
        }
        const thirdSeat = nextSeat(seat);
        const partnerSeat = nextSeat(thirdSeat);
        const suitThreat = threat.threatsBySuit[leadSuit];
        if (suitThreat && suitThreat.active && suitThreat.establishedOwner === thirdSeat) {
          const threatRankValue = RANK_STRENGTH[suitThreat.threatRank];
          const partnerCanBeatThreat = (hands[partnerSeat][leadSuit] ?? []).some((rank) => RANK_STRENGTH[rank] > threatRankValue);
          if (!partnerCanBeatThreat) {
            const covering = busyCards.filter((cardId) => RANK_STRENGTH[rankOfCardId(cardId)] > threatRankValue);
            const ddFiltered = applyDdFilter(covering);
            const chosenCardId = chooseLowestByRank(ddFiltered.candidates);
            if (chosenCardId) {
              const chosenBucket = 'follow:busy-protect-threat';
              return {
                chosenCardId,
                chosenBucket,
                bucketCards: [...ddFiltered.candidates],
                policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, ddFiltered.candidates),
                ddPolicy: ddFiltered.trace,
                ddTrace: buildDdDecisionTrace(inSuitCardIds, covering, ddFiltered, chosenCardId),
                rngBefore,
                rngAfter
              };
            }
          }
        }
      }
    }

    if (!threat || !threatLabels) {
      const bucketCards = inSuit.map((p) => toCardId(p.suit, p.rank) as CardId);
      const ddFiltered = applyDdFilter(bucketCards, inSuitCardIds);
      const [idx, nextRng] = pickRandomIndex(ddFiltered.candidates.length, rngAfter);
      rngAfter = nextRng;
      const chosenCardId = ddFiltered.candidates[idx] ?? ddFiltered.candidates[0] ?? null;
      const chosenBucket = 'follow:baseline';
      return {
        chosenCardId,
        chosenBucket,
        bucketCards: [...ddFiltered.candidates],
        policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, ddFiltered.candidates),
        ddPolicy: ddFiltered.trace,
        ddTrace: buildDdDecisionTrace(inSuitCardIds, bucketCards, ddFiltered, chosenCardId),
        rngBefore,
        rngAfter
      };
    }

    const threshold = getIdleThreatThresholdRank(leadSuit, threat, threatLabels, resource ?? undefined);
    if (!threshold) {
      const bucketCards = inSuit.map((p) => toCardId(p.suit, p.rank) as CardId);
      const ddFiltered = applyDdFilter(bucketCards, inSuitCardIds);
      const [idx, nextRng] = pickRandomIndex(ddFiltered.candidates.length, rngAfter);
      rngAfter = nextRng;
      const chosenCardId = ddFiltered.candidates[idx] ?? ddFiltered.candidates[0] ?? null;
      const chosenBucket = 'follow:baseline';
      return {
        chosenCardId,
        chosenBucket,
        bucketCards: [...ddFiltered.candidates],
        policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, ddFiltered.candidates),
        ddPolicy: ddFiltered.trace,
        ddTrace: buildDdDecisionTrace(inSuitCardIds, bucketCards, ddFiltered, chosenCardId),
        rngBefore,
        rngAfter
      };
    }

    const below = inSuit.filter((p) => RANK_STRENGTH[p.rank] < RANK_STRENGTH[threshold]);
    const above = inSuit.filter((p) => RANK_STRENGTH[p.rank] >= RANK_STRENGTH[threshold]);
    const bucket = below.length > 0 ? below : above;
    const bucketCards = bucket.map((p) => toCardId(p.suit, p.rank) as CardId);
    const ddFiltered = applyDdFilter(bucketCards, inSuitCardIds);
    const [idx, nextRng] = pickRandomIndex(ddFiltered.candidates.length, rngAfter);
    rngAfter = nextRng;
    const chosenCardId = ddFiltered.candidates[idx] ?? ddFiltered.candidates[0] ?? null;
    const chosenBucket = below.length > 0 ? 'follow:below' : 'follow:above';
    return {
      chosenCardId,
      chosenBucket,
      bucketCards: [...ddFiltered.candidates],
      policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, ddFiltered.candidates),
      ddPolicy: ddFiltered.trace,
      ddTrace: buildDdDecisionTrace(inSuitCardIds, bucketCards, ddFiltered, chosenCardId),
      rngBefore,
      rngAfter
    };
  }

  if (!threat) {
    return { chosenCardId: null, rngBefore, rngAfter };
  }

  const labels: DefenderLabels =
    threatLabels ??
    {
      E: { busy: new Set(), idle: new Set() },
      W: { busy: new Set(), idle: new Set() }
    };
  const tiers = computeDiscardTiers(seat, { hands }, leadSuit, threat, labels, resource ?? undefined);
  const ordered: Array<{ name: string; cards: CardId[] }> = [
    { name: 'tier1a', cards: tiers.tier1a },
    { name: 'tier1b', cards: tiers.tier1b },
    { name: 'tier2a', cards: tiers.tier2a },
    { name: 'tier2b', cards: tiers.tier2b },
    { name: 'tier3a', cards: tiers.tier3a },
    { name: 'tier3b', cards: tiers.tier3b },
    { name: 'tier3c', cards: tiers.tier3c },
    { name: 'tier4a', cards: tiers.tier4a },
    { name: 'tier4b', cards: tiers.tier4b },
    { name: 'tier4c', cards: tiers.tier4c },
    { name: 'tier5', cards: tiers.tier5 }
  ];
  const chosen = ordered.find((o) => o.cards.length > 0) ?? { name: 'tier5', cards: tiers.tier5 };
  const ddFiltered = applyDdFilter(chosen.cards, tiers.legal);
  const [idx, nextRng] = pickRandomIndex(ddFiltered.candidates.length, rngAfter);
  rngAfter = nextRng;
  const chosenCardId = ddFiltered.candidates[idx] ?? ddFiltered.candidates[0] ?? null;
  const policyClassByCard = buildPolicyClassByCard(hands, seat, chosen.name, ddFiltered.candidates) ?? {};
  for (const card of [...tiers.tier2a, ...tiers.tier2b]) {
    policyClassByCard[card] = `semiIdle:${card[0]}`;
  }
  for (const card of [...tiers.tier3a, ...tiers.tier3b, ...tiers.tier4a, ...tiers.tier4b]) {
    policyClassByCard[card] = `busy:${card[0]}`;
  }
  const tierBuckets: Partial<Record<'tier3a' | 'tier3b' | 'tier3c' | 'tier4a' | 'tier4b' | 'tier4c', CardId[]>> = {};
  if (tiers.tier3a.length > 0) tierBuckets.tier3a = [...tiers.tier3a];
  if (tiers.tier3b.length > 0) tierBuckets.tier3b = [...tiers.tier3b];
  if (tiers.tier3c.length > 0) tierBuckets.tier3c = [...tiers.tier3c];
  if (tiers.tier4a.length > 0) tierBuckets.tier4a = [...tiers.tier4a];
  if (tiers.tier4b.length > 0) tierBuckets.tier4b = [...tiers.tier4b];
  if (tiers.tier4c.length > 0) tierBuckets.tier4c = [...tiers.tier4c];

  return {
    chosenCardId,
    chosenBucket: chosen.name,
    bucketCards: [...ddFiltered.candidates],
    policyClassByCard,
    tierBuckets,
    discardTiers: tiers,
    ddPolicy: ddFiltered.trace,
    ddTrace: buildDdDecisionTrace(tiers.legal, chosen.cards, ddFiltered, chosenCardId),
    rngBefore,
    rngAfter
  };
}
