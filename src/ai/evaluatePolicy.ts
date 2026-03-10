import type { Hand, Play, Policy, Rank, RngState, Seat, State, Suit } from '../core';
import { computeDiscardTiers, type DiscardTiers, getIdleThreatThresholdRank } from './defenderDiscard';
import { parseCardId, toCardId, type CardId, type DefenderLabels, type ThreatContext } from './threatModel';
import { classInfoForCard } from '../core/equivalence';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
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

export type EvaluatePolicyInput = {
  policy: Policy;
  seat: 'E' | 'W';
  hands: Record<Seat, Hand>;
  trick: Play[];
  threat: ThreatContext | null;
  threatLabels: DefenderLabels | null;
  rng: RngState;
};

export type EvaluatePolicyOutput = {
  chosenCardId: CardId | null;
  chosenBucket?: string;
  bucketCards?: CardId[];
  policyClassByCard?: Record<string, string>;
  tierBuckets?: Partial<Record<'tier3a' | 'tier3b' | 'tier4a' | 'tier4b', CardId[]>>;
  discardTiers?: DiscardTiers;
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
    } else if (chosenBucket === 'tier2') {
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
  const { policy, seat, hands, trick, threat, threatLabels } = input;
  const leadSuit = trick[0]?.suit ?? null;
  const rngBefore = { seed: input.rng.seed >>> 0, counter: input.rng.counter };
  let rngAfter = { ...rngBefore };

  if (policy.kind === 'randomLegal') {
    const legal = legalPlaysForSeat(hands, seat, leadSuit);
    const [chosenCardId, nextRng] = chooseUniformLegalCardId(hands, seat, leadSuit, rngAfter);
    rngAfter = nextRng;
    const chosenBucket = 'legal';
    const bucketCards = legal.map((p) => toCardId(p.suit, p.rank) as CardId);
    return {
      chosenCardId,
      chosenBucket,
      bucketCards,
      policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, bucketCards),
      rngBefore,
      rngAfter
    };
  }

  if (leadSuit === null) {
    const legal = legalPlaysForSeat(hands, seat, null);
    const [chosenCardId, nextRng] = chooseUniformLegalCardId(hands, seat, null, rngAfter);
    rngAfter = nextRng;
    const chosenBucket = 'lead:none';
    const bucketCards = legal.map((p) => toCardId(p.suit, p.rank) as CardId);
    return {
      chosenCardId,
      chosenBucket,
      bucketCards,
      policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, bucketCards),
      rngBefore,
      rngAfter
    };
  }

  const inSuit = legalPlaysForSeat(hands, seat, leadSuit);
  if (hands[seat][leadSuit].length > 0) {
    if (!threat || !threatLabels) {
      const [chosenCardId, nextRng] = chooseUniformLegalCardId(hands, seat, leadSuit, rngAfter);
      rngAfter = nextRng;
      const chosenBucket = 'follow:baseline';
      const bucketCards = inSuit.map((p) => toCardId(p.suit, p.rank) as CardId);
      return {
        chosenCardId,
        chosenBucket,
        bucketCards,
        policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, bucketCards),
        rngBefore,
        rngAfter
      };
    }

    const threshold = getIdleThreatThresholdRank(leadSuit, threat, threatLabels);
    if (!threshold) {
      const [chosenCardId, nextRng] = chooseUniformLegalCardId(hands, seat, leadSuit, rngAfter);
      rngAfter = nextRng;
      const chosenBucket = 'follow:baseline';
      const bucketCards = inSuit.map((p) => toCardId(p.suit, p.rank) as CardId);
      return {
        chosenCardId,
        chosenBucket,
        bucketCards,
        policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, bucketCards),
        rngBefore,
        rngAfter
      };
    }

    const below = inSuit.filter((p) => RANK_STRENGTH[p.rank] < RANK_STRENGTH[threshold]);
    const above = inSuit.filter((p) => RANK_STRENGTH[p.rank] >= RANK_STRENGTH[threshold]);
    const bucket = below.length > 0 ? below : above;
    const [idx, nextRng] = pickRandomIndex(bucket.length, rngAfter);
    rngAfter = nextRng;
    const selected = bucket[idx] ?? bucket[0] ?? inSuit[0] ?? null;
    const chosenCardId = selected ? (toCardId(selected.suit, selected.rank) as CardId) : null;
    const chosenBucket = below.length > 0 ? 'follow:below' : 'follow:above';
    const bucketCards = bucket.map((p) => toCardId(p.suit, p.rank) as CardId);
    return {
      chosenCardId,
      chosenBucket,
      bucketCards,
      policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, bucketCards),
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
  const tiers = computeDiscardTiers(seat, { hands }, leadSuit, threat, labels);
  const ordered: Array<{ name: string; cards: CardId[] }> = [
    { name: 'tier1a', cards: tiers.tier1a },
    { name: 'tier1b', cards: tiers.tier1b },
    { name: 'tier2', cards: tiers.tier2 },
    { name: 'tier3a', cards: tiers.tier3a },
    { name: 'tier3b', cards: tiers.tier3b },
    { name: 'tier4a', cards: tiers.tier4a },
    { name: 'tier4b', cards: tiers.tier4b },
    { name: 'tier5', cards: tiers.tier5 }
  ];
  const chosen = ordered.find((o) => o.cards.length > 0) ?? { name: 'tier5', cards: tiers.tier5 };
  const [idx, nextRng] = pickRandomIndex(chosen.cards.length, rngAfter);
  rngAfter = nextRng;
  const chosenCardId = chosen.cards[idx] ?? chosen.cards[0] ?? null;
  const policyClassByCard = buildPolicyClassByCard(hands, seat, chosen.name, chosen.cards) ?? {};
  for (const card of tiers.tier2) {
    policyClassByCard[card] = `semiIdle:${card[0]}`;
  }
  for (const card of [...tiers.tier3a, ...tiers.tier3b, ...tiers.tier4a, ...tiers.tier4b]) {
    policyClassByCard[card] = `busy:${card[0]}`;
  }
  const tierBuckets: Partial<Record<'tier3a' | 'tier3b' | 'tier4a' | 'tier4b', CardId[]>> = {};
  if (tiers.tier3a.length > 0) tierBuckets.tier3a = [...tiers.tier3a];
  if (tiers.tier3b.length > 0) tierBuckets.tier3b = [...tiers.tier3b];
  if (tiers.tier4a.length > 0) tierBuckets.tier4a = [...tiers.tier4a];
  if (tiers.tier4b.length > 0) tierBuckets.tier4b = [...tiers.tier4b];

  return {
    chosenCardId,
    chosenBucket: chosen.name,
    bucketCards: [...chosen.cards],
    policyClassByCard,
    tierBuckets,
    discardTiers: tiers,
    rngBefore,
    rngAfter
  };
}
