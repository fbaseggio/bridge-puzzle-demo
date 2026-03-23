import type { EwVariantState, Hand, Play, Policy, Rank, RngState, Seat, State, Suit } from '../core';
import { computeDiscardTiers, type DiscardTiers, getIdleThreatThresholdRank } from './defenderDiscard';
import {
  initClassification,
  parseCardId,
  toCardId,
  updateClassificationAfterPlay,
  type CardId,
  type CardRole,
  type ClassificationState,
  type ClassificationTrigger,
  type DefenderLabels,
  type ResourceContext,
  type ThreatContext
} from './threatModel';
import { classInfoForCard } from '../core/equivalence';
import { buildCanonicalPositionSignature, type DdPolicyTrace } from './ddPolicy';

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

function highestNonWinnerNonThreatRankForNs(suit: Suit, hands: Record<Seat, Hand>, threat: ThreatContext | null): Rank | null {
  const defenderRanks = [...hands.E[suit], ...hands.W[suit]];
  if (defenderRanks.length === 0) return null;
  const maxDefender = defenderRanks.reduce((max, rank) => Math.max(max, RANK_STRENGTH[rank]), 0);
  const activeThreatCard = threat?.threatsBySuit[suit]?.active ? threat.threatsBySuit[suit]?.threatCardId : null;
  const candidates: Rank[] = [];
  for (const seat of ['N', 'S'] as const) {
    for (const rank of hands[seat][suit]) {
      const cardId = toCardId(suit, rank) as CardId;
      if (activeThreatCard && cardId === activeThreatCard) continue;
      if (RANK_STRENGTH[rank] > maxDefender) continue; // obvious winner
      candidates.push(rank);
    }
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((best, rank) => (RANK_STRENGTH[rank] > RANK_STRENGTH[best] ? rank : best), candidates[0]);
}

function threatSymbolBase(symbol?: string): string {
  if (!symbol) return '';
  const lower = symbol.toLowerCase();
  if (lower.startsWith("g'")) return "g'";
  return lower.slice(0, 1);
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
  ewVariantState: EwVariantState | null;
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
  ewVariantTrace?: {
    activeVariantIds: string[];
    perVariant: Array<{
      variantId: string;
      chosenBucket?: string;
      playable: CardId[];
      chosenCardId: CardId | null;
      a: CardId[];
      b: CardId[];
      bBuckets: string[];
      c: CardId[];
      d: CardId[];
    }>;
    intersection: CardId[];
    arbitration: 'single-variant' | 'intersection' | 'eliminate';
    chosenVariantId?: string;
    chosenCardId: CardId | null;
  };
  ewVariantState?: EwVariantState | null;
  rngBefore: RngState;
  rngAfter: RngState;
};

function cloneHand(hand: Hand): Hand {
  return {
    S: [...hand.S],
    H: [...hand.H],
    D: [...hand.D],
    C: [...hand.C]
  };
}

function cloneEwVariantState(state: EwVariantState | null): EwVariantState | null {
  if (!state) return null;
  return {
    variants: state.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      hands: {
        E: cloneHand(variant.hands.E),
        W: cloneHand(variant.hands.W)
      }
    })),
    activeVariantIds: [...state.activeVariantIds],
    committedVariantId: state.committedVariantId,
    representativeVariantId: state.representativeVariantId
  };
}

function combinedHandsForVariant(
  hands: Record<Seat, Hand>,
  variant: NonNullable<EwVariantState['variants']>[number]
): Record<Seat, Hand> {
  return {
    N: cloneHand(hands.N),
    E: cloneHand(variant.hands.E),
    S: cloneHand(hands.S),
    W: cloneHand(variant.hands.W)
  };
}

function cardExistsInHands(hands: Record<Seat, Hand>, cardId: CardId): boolean {
  const { suit, rank } = parseCardId(cardId);
  return ['N', 'E', 'S', 'W'].some((seat) => hands[seat as Seat][suit].includes(rank));
}

function classifyWorld(input: EvaluatePolicyInput, hands: Record<Seat, Hand>): {
  threat: ThreatContext | null;
  resource: ResourceContext | null;
  threatLabels: DefenderLabels | null;
  cardRoles: Partial<Record<CardId, CardRole>>;
} {
  const threatCardIds = (input.threat?.threatCardIds ?? []).filter((cardId) => cardExistsInHands(hands, cardId));
  const resourceCardIds = (input.resource?.resourceCardIds ?? []).filter((cardId) => cardExistsInHands(hands, cardId));
  if (threatCardIds.length === 0 && resourceCardIds.length === 0) {
    return { threat: null, resource: null, threatLabels: null, cardRoles: {} };
  }
  const threatSymbolByCardId = Object.fromEntries(
    Object.values(input.threat?.threatsBySuit ?? {})
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .map((entry) => [entry.threatCardId, entry.symbol])
      .filter(([cardId]) => threatCardIds.includes(cardId as CardId))
      .filter(([, symbol]) => typeof symbol === 'string')
  ) as Partial<Record<CardId, string>>;
  const classification = initClassification(
    { hands },
    threatCardIds,
    resourceCardIds,
    undefined,
    threatSymbolByCardId
  );
  return {
    threat: classification.threat,
    resource: classification.resource,
    threatLabels: classification.labels,
    cardRoles: classification.perCardRole
  };
}

function playableCardsFromEvaluation(output: EvaluatePolicyOutput): CardId[] {
  if (output.ddTrace) {
    if (output.ddTrace.path !== 'disabled') {
      if (output.ddTrace.after.length > 0) return [...output.ddTrace.after];
    } else if (output.ddTrace.legal.length > 0) {
      return [...output.ddTrace.legal];
    }
  }
  if (output.discardTiers?.legal && output.discardTiers.legal.length > 0) {
    return [...output.discardTiers.legal];
  }
  if (output.bucketCards && output.bucketCards.length > 0) return [...output.bucketCards];
  return output.chosenCardId ? [output.chosenCardId] : [];
}

function legalUniverseFromEvaluation(output: EvaluatePolicyOutput): CardId[] {
  if (output.ddTrace?.legal && output.ddTrace.legal.length > 0) return [...output.ddTrace.legal];
  if (output.discardTiers?.legal && output.discardTiers.legal.length > 0) return [...output.discardTiers.legal];
  if (output.bucketCards && output.bucketCards.length > 0) return [...output.bucketCards];
  return output.chosenCardId ? [output.chosenCardId] : [];
}

type VariantCardLabel = 'A' | 'B' | 'C' | 'D';

function classifyVariantCard(
  card: CardId,
  output: EvaluatePolicyOutput,
  hands: Record<Seat, Hand>,
  seat: 'E' | 'W',
  demotedCards?: Set<CardId>
): VariantCardLabel {
  const legalUniverse = new Set(legalUniverseFromEvaluation(output));
  const playable = new Set(playableCardsFromEvaluation(output));
  const bucket = new Set(output.bucketCards ?? []);
  const preferred = new Set(preferredCardsForEvaluation(hands, seat, output));
  if (!legalUniverse.has(card)) return 'D';
  if (!playable.has(card)) return 'D';
  if (preferred.has(card)) return demotedCards?.has(card) ? 'C' : 'A';
  if (bucket.has(card)) return demotedCards?.has(card) ? 'C' : 'B';
  return 'C';
}

function labelRank(label: VariantCardLabel): number {
  return ({ A: 0, B: 1, C: 2, D: 3 } as const)[label];
}

function compareLabelVectors(left: VariantCardLabel[], right: VariantCardLabel[]): number {
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = labelRank(left[i] ?? 'D') - labelRank(right[i] ?? 'D');
    if (diff !== 0) return diff;
  }
  return 0;
}

function pickSeededCard(cards: CardId[], rng: RngState): [CardId | null, RngState] {
  if (cards.length === 0) return [null, rng];
  const [idx, nextRng] = pickRandomIndex(cards.length, rng);
  return [cards[idx] ?? cards[0] ?? null, nextRng];
}

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

function cloneHands(hands: Record<Seat, Hand>): Record<Seat, Hand> {
  return {
    N: cloneHand(hands.N),
    E: cloneHand(hands.E),
    S: cloneHand(hands.S),
    W: cloneHand(hands.W)
  };
}

function decisionTriggerForSeat(hands: Record<Seat, Hand>, seat: 'E' | 'W', trick: Play[]): ClassificationTrigger {
  const leadSuit = trick[0]?.suit ?? null;
  if (!leadSuit) return 'lead';
  return hands[seat][leadSuit].length > 0 ? 'follow' : 'discard';
}

function simulateVariantRolesAfterPlay(
  input: EvaluatePolicyInput,
  worldHands: Record<Seat, Hand>,
  world: {
    threat: ThreatContext | null;
    resource: ResourceContext | null;
    threatLabels: DefenderLabels | null;
    cardRoles: Partial<Record<CardId, CardRole>>;
  },
  seat: 'E' | 'W',
  cardId: CardId
): Partial<Record<CardId, CardRole>> {
  if (!world.threat || !world.threatLabels) return {};
  const nextHands = cloneHands(worldHands);
  const { suit, rank } = parseCardId(cardId);
  const idx = nextHands[seat][suit].indexOf(rank);
  if (idx < 0) return world.cardRoles;
  nextHands[seat][suit].splice(idx, 1);
  const trigger = decisionTriggerForSeat(worldHands, seat, input.trick);
  const play = { seat, suit, rank };
  const runtime = {
    trick: [...input.trick, play],
    trumpSuit: input.contractStrain === 'NT' ? null : input.contractStrain ?? null,
    goalStatus: null
  };
  let updated = updateClassificationAfterPlay(
    {
      threat: world.threat,
      resource: world.resource ?? { resourceCardIds: [], resourcesBySuit: {} },
      labels: world.threatLabels,
      perCardRole: world.cardRoles
    } as ClassificationState,
    { hands: nextHands },
    cardId,
    runtime,
    trigger,
    'immediate'
  );
  if (trigger === 'discard') {
    updated = updateClassificationAfterPlay(updated, { hands: nextHands }, cardId, runtime, trigger, 'deferred');
  }
  return updated.perCardRole;
}

function cardEqualsInLegalUniverse(
  hands: Record<Seat, Hand>,
  seat: 'E' | 'W',
  cardId: CardId,
  legalUniverse: CardId[]
): CardId[] {
  const legalSet = new Set(legalUniverse);
  const members = classInfoForCard({ hands } as unknown as State, seat, cardId).members
    .filter((member): member is CardId => legalSet.has(member as CardId));
  return members.length > 0 ? members : legalSet.has(cardId) ? [cardId] : [];
}

function ambiguousThreatDemotions(
  input: EvaluatePolicyInput,
  evaluations: Array<{
    variant: NonNullable<EwVariantState['variants']>[number];
    worldHands: Record<Seat, Hand>;
    world: {
      threat: ThreatContext | null;
      resource: ResourceContext | null;
      threatLabels: DefenderLabels | null;
      cardRoles: Partial<Record<CardId, CardRole>>;
    };
    output: EvaluatePolicyOutput;
  }>
): Map<string, Set<CardId>> {
  const demotedByVariant = new Map<string, Set<CardId>>();
  const designatedThreats = (input.threat?.threatCardIds ?? []).filter((cardId) =>
    evaluations.every(({ worldHands }) => cardExistsInHands(worldHands, cardId))
  );
  if (designatedThreats.length === 0) return demotedByVariant;

  const candidateCards = [...new Set(evaluations.flatMap(({ output }) => legalUniverseFromEvaluation(output)))];
  for (const candidate of candidateCards) {
    const labels = evaluations.map(({ output, worldHands }) => classifyVariantCard(candidate, output, worldHands, input.seat));
    if (labels.some((label) => label === 'D')) continue;

    const afterRolesByVariant = evaluations.map(({ worldHands, world }) =>
      simulateVariantRolesAfterPlay(input, worldHands, world, input.seat, candidate)
    );
    const resolvesAmbiguity = designatedThreats.some((threatCardId) => {
      const beforeRoles = evaluations.map(({ world }) => world.cardRoles[threatCardId] ?? 'default');
      const wasAmbiguous = beforeRoles.some((role) => role !== beforeRoles[0]);
      if (!wasAmbiguous) return false;
      const afterRoles = afterRolesByVariant.map((roles) => roles[threatCardId] ?? 'default');
      return afterRoles.every((role) => role === 'promotedWinner');
    });
    if (!resolvesAmbiguity) continue;

    evaluations.forEach(({ variant, worldHands, output }) => {
      const legalUniverse = legalUniverseFromEvaluation(output);
      const equals = cardEqualsInLegalUniverse(worldHands, input.seat, candidate, legalUniverse);
      if (equals.length === 0) return;
      const bucket = demotedByVariant.get(variant.id) ?? new Set<CardId>();
      equals.forEach((equalCard) => bucket.add(equalCard));
      demotedByVariant.set(variant.id, bucket);
    });
  }

  return demotedByVariant;
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

function preferredCardsForEvaluation(
  hands: Record<Seat, Hand>,
  seat: 'E' | 'W',
  output: EvaluatePolicyOutput
): CardId[] {
  if (!output.chosenCardId) return [];
  const legalUniverse = new Set(legalUniverseFromEvaluation(output));
  const members = classInfoForCard({ hands } as unknown as State, seat, output.chosenCardId).members
    .filter((card): card is CardId => legalUniverse.has(card as CardId));
  return members.length > 0 ? members : [output.chosenCardId];
}

function evaluatePolicySingleWorld(input: EvaluatePolicyInput): EvaluatePolicyOutput {
  const { policy, seat, hands, trick, threat, resource, threatLabels } = input;
  const leadSuit = trick[0]?.suit ?? null;
  const rngBefore = { seed: input.rng.seed >>> 0, counter: input.rng.counter };
  let rngAfter = { ...rngBefore };
  const contractStrain = input.contractStrain ?? 'NT';
  const signature = buildCanonicalPositionSignature({ contractStrain, seat, hands, trick });
  const ddSource = 'off' as const;
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
    return {
      candidates: [...candidates],
      trace: undefined,
      lookup: false,
      found: false,
      path: 'disabled'
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

    // Resource-stopper follow (tier-2b semantics): play low before "cheap-win" logic.
    if (resource) {
      const entry = resource.resourcesBySuit[leadSuit];
      const suitRanks = hands[seat][leadSuit];
      const hasHigher = !!entry && suitRanks.some((r) => RANK_STRENGTH[r] > RANK_STRENGTH[entry.resourceRank]);
      const longEnough = !!entry && suitRanks.length >= entry.resourceLength;
      if (entry?.active && hasHigher && longEnough) {
        const ddFiltered = applyDdFilter(inSuitCardIds, inSuitCardIds);
        const chosenCardId = chooseLowestByRank(ddFiltered.candidates);
        if (chosenCardId) {
          const chosenBucket = 'follow:below';
          return {
            chosenCardId,
            chosenBucket,
            bucketCards: [...ddFiltered.candidates],
            policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, ddFiltered.candidates),
            ddPolicy: ddFiltered.trace,
            ddTrace: buildDdDecisionTrace(inSuitCardIds, inSuitCardIds, ddFiltered, chosenCardId),
            rngBefore,
            rngAfter
          };
        }
      }
    }

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
      const leadSuitThreat = leadSuit ? threat.threatsBySuit[leadSuit] : undefined;
      const leadSuitIsResource = threatSymbolBase(leadSuitThreat?.symbol) === 'f';
      const busyCards = inSuitCardIds.filter((cardId) => threatLabels[seat].busy.has(cardId));
      if (!leadSuitIsResource && busyCards.length > 0 && busyCards.length === inSuitCardIds.length) {
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

    const threatThreshold = threat && threatLabels
      ? getIdleThreatThresholdRank(leadSuit, threat, threatLabels, resource ?? undefined)
      : null;
    const nsSoftThreshold = highestNonWinnerNonThreatRankForNs(leadSuit, hands, threat);

    if (!threatThreshold && !nsSoftThreshold) {
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

    const belowBoth = inSuit.filter((p) => {
      const rank = RANK_STRENGTH[p.rank];
      const belowThreat = threatThreshold ? rank < RANK_STRENGTH[threatThreshold] : true;
      const belowSoft = nsSoftThreshold ? rank < RANK_STRENGTH[nsSoftThreshold] : true;
      return belowThreat && belowSoft;
    });
    const belowEither = inSuit.filter((p) => {
      const rank = RANK_STRENGTH[p.rank];
      const belowThreat = threatThreshold ? rank < RANK_STRENGTH[threatThreshold] : false;
      const belowSoft = nsSoftThreshold ? rank < RANK_STRENGTH[nsSoftThreshold] : false;
      return belowThreat || belowSoft;
    });
    const aboveBoth = inSuit.filter((p) => {
      const rank = RANK_STRENGTH[p.rank];
      const atOrAboveThreat = threatThreshold ? rank >= RANK_STRENGTH[threatThreshold] : true;
      const atOrAboveSoft = nsSoftThreshold ? rank >= RANK_STRENGTH[nsSoftThreshold] : true;
      return atOrAboveThreat && atOrAboveSoft;
    });
    const bucket = belowBoth.length > 0 ? belowBoth : belowEither.length > 0 ? belowEither : aboveBoth;
    const bucketCards = bucket.map((p) => toCardId(p.suit, p.rank) as CardId);
    const ddFiltered = applyDdFilter(bucketCards, inSuitCardIds);
    const [idx, nextRng] = pickRandomIndex(ddFiltered.candidates.length, rngAfter);
    rngAfter = nextRng;
    const chosenCardId = ddFiltered.candidates[idx] ?? ddFiltered.candidates[0] ?? null;
    const chosenBucket =
      belowBoth.length > 0 ? 'follow:below' : belowEither.length > 0 ? 'follow:below-partial' : 'follow:above';
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
    const legal = legalPlaysForSeat(hands, seat, leadSuit);
    const legalCardIds = legal.map((p) => toCardId(p.suit, p.rank) as CardId);
    const ddFiltered = applyDdFilter(legalCardIds, legalCardIds);
    const [idx, nextRng] = pickRandomIndex(ddFiltered.candidates.length, rngAfter);
    rngAfter = nextRng;
    const chosenCardId = ddFiltered.candidates[idx] ?? ddFiltered.candidates[0] ?? null;
    const chosenBucket = 'discard:baseline';
    return {
      chosenCardId,
      chosenBucket,
      bucketCards: [...ddFiltered.candidates],
      policyClassByCard: buildPolicyClassByCard(hands, seat, chosenBucket, ddFiltered.candidates),
      ddPolicy: ddFiltered.trace,
      ddTrace: buildDdDecisionTrace(legalCardIds, legalCardIds, ddFiltered, chosenCardId),
      rngBefore,
      rngAfter
    };
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

export function evaluatePolicy(input: EvaluatePolicyInput): EvaluatePolicyOutput {
  const variantState = input.ewVariantState;
  if (!variantState || input.seat !== 'E' && input.seat !== 'W') {
    return evaluatePolicySingleWorld(input);
  }

  const activeVariants = variantState.variants.filter((variant) => variantState.activeVariantIds.includes(variant.id));
  if (activeVariants.length === 0) {
    return evaluatePolicySingleWorld(input);
  }

  if (activeVariants.length === 1) {
    const onlyVariant = activeVariants[0];
    const worldHands = combinedHandsForVariant(input.hands, onlyVariant);
    const world = classifyWorld(input, worldHands);
    const output = evaluatePolicySingleWorld({
      ...input,
      hands: worldHands,
      threat: world.threat,
      resource: world.resource,
      threatLabels: world.threatLabels,
      ewVariantState: null
    });
    return {
      ...output,
      ewVariantTrace: {
        activeVariantIds: [onlyVariant.id],
        perVariant: [
          {
            variantId: onlyVariant.id,
            chosenBucket: output.chosenBucket,
            playable: playableCardsFromEvaluation(output),
            chosenCardId: output.chosenCardId
            ,
            a: preferredCardsForEvaluation(worldHands, input.seat, output),
            b: (output.bucketCards ?? []).filter((card) => !preferredCardsForEvaluation(worldHands, input.seat, output).includes(card)),
            bBuckets: (output.bucketCards ?? []).some((card) => !preferredCardsForEvaluation(worldHands, input.seat, output).includes(card))
              ? [output.chosenBucket ?? '-']
              : [],
            c: playableCardsFromEvaluation(output).filter((card) => {
              const a = preferredCardsForEvaluation(worldHands, input.seat, output);
              const b = (output.bucketCards ?? []).filter((bucketCard) => !a.includes(bucketCard));
              return !a.includes(card) && !b.includes(card);
            }),
            d: []
          }
        ],
        intersection: playableCardsFromEvaluation(output),
        arbitration: 'single-variant',
        chosenVariantId: onlyVariant.id,
        chosenCardId: output.chosenCardId
      },
      ewVariantState: {
        variants: cloneEwVariantState(variantState)?.variants ?? [],
        activeVariantIds: [onlyVariant.id],
        committedVariantId: variantState.committedVariantId ?? onlyVariant.id,
        representativeVariantId: onlyVariant.id
      }
    };
  }

  const rngBefore = { seed: input.rng.seed >>> 0, counter: input.rng.counter };
  let rngAfter = { ...rngBefore };
  const evaluations = activeVariants.map((variant) => {
    const worldHands = combinedHandsForVariant(input.hands, variant);
    const world = classifyWorld(input, worldHands);
    return {
      variant,
      worldHands,
      world,
      output: evaluatePolicySingleWorld({
        ...input,
        hands: worldHands,
        threat: world.threat,
        resource: world.resource,
        threatLabels: world.threatLabels,
        ewVariantState: null,
        rng: rngBefore
      })
    };
  });
  const playableByVariant = evaluations.map(({ variant, output }) => ({
    variant,
    output,
    playable: playableCardsFromEvaluation(output)
  }));
  const demotedByVariant = ambiguousThreatDemotions(input, evaluations);
  const candidateCards = [...new Set(playableByVariant.flatMap(({ output }) => legalUniverseFromEvaluation(output)))];
  const cardScores = candidateCards.map((card) => {
    const labels = evaluations.map(({ variant, output, worldHands }) =>
      classifyVariantCard(card, output, worldHands, input.seat, demotedByVariant.get(variant.id))
    );
    const dCount = labels.filter((label) => label === 'D').length;
    const cCount = labels.filter((label) => label === 'C').length;
    const aCount = labels.filter((label) => label === 'A').length;
    return { card, labels, dCount, cCount, aCount };
  });
  cardScores.sort((left, right) => {
    if (left.dCount !== right.dCount) return left.dCount - right.dCount;
    if (left.cCount !== right.cCount) return left.cCount - right.cCount;
    if (left.aCount !== right.aCount) return right.aCount - left.aCount;
    const variantOrderDiff = compareLabelVectors(left.labels, right.labels);
    if (variantOrderDiff !== 0) return variantOrderDiff;
    return left.card.localeCompare(right.card);
  });
  const chosenCardId = cardScores[0]?.card ?? null;
  const chosenLabels = cardScores[0]?.labels ?? [];
  const survivingVariantIds = playableByVariant
    .filter((_, index) => chosenLabels[index] !== 'D')
    .map(({ variant }) => variant.id);
  const survivingVariants = playableByVariant.filter(({ variant }) => survivingVariantIds.includes(variant.id));
  const representativeVariantId =
    variantState.representativeVariantId && survivingVariantIds.includes(variantState.representativeVariantId)
      ? variantState.representativeVariantId
      : survivingVariantIds[0] ?? variantState.representativeVariantId;
  const chosenRepresentative = survivingVariants.find(({ variant }) => variant.id === representativeVariantId) ?? survivingVariants[0];
  const commonPlayable = playableByVariant.reduce<CardId[]>(
    (shared, current) => shared.filter((card) => current.playable.includes(card)),
    [...playableByVariant[0].playable]
  );

  return {
    ...(chosenRepresentative?.output ?? playableByVariant[0].output),
    chosenCardId,
    chosenBucket: 'variant:score',
    bucketCards: chosenCardId ? [chosenCardId] : [],
    ewVariantTrace: {
      activeVariantIds: activeVariants.map((variant) => variant.id),
      perVariant: evaluations.map(({ variant, output, worldHands }) => {
        const playable = playableCardsFromEvaluation(output);
        const demoted = demotedByVariant.get(variant.id) ?? new Set<CardId>();
        const preferred = preferredCardsForEvaluation(worldHands, input.seat, output);
        const a = preferred.filter((card) => !demoted.has(card));
        const b = (output.bucketCards ?? []).filter((card) => !preferred.includes(card) && !demoted.has(card));
        const c = playable.filter((card) => !a.includes(card) && !b.includes(card));
        const legalUniverse = legalUniverseFromEvaluation(output);
        const d = legalUniverse.filter((card) => !playable.includes(card));
        return {
          variantId: variant.id,
          chosenBucket: output.chosenBucket,
          playable,
          chosenCardId: output.chosenCardId,
          a,
          b,
          bBuckets: b.length > 0 ? [output.chosenBucket ?? '-'] : [],
          c,
          d
        };
      }),
      intersection: [...commonPlayable],
      arbitration: survivingVariantIds.length === activeVariants.length ? 'intersection' : 'eliminate',
      chosenVariantId: survivingVariantIds.length === 1 ? survivingVariantIds[0] : undefined,
      chosenCardId
    },
    rngBefore,
    rngAfter,
    ewVariantState: {
      variants: cloneEwVariantState(variantState)?.variants ?? [],
      activeVariantIds: survivingVariantIds,
      committedVariantId: survivingVariantIds.length === 1 ? survivingVariantIds[0] : null,
      representativeVariantId
    }
  };
}
