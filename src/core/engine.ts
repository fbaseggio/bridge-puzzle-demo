import type { EngineEvent, Goal, Hand, Play, Policy, Problem, Rank, Seat, State, Suit } from './types';
import { computeDiscardTiers, getIdleThreatThresholdRank } from '../ai/defenderDiscard';
import { initClassification, parseCardId, toCardId, updateClassificationAfterPlay, type CardId, type DefenderLabels } from '../ai/threatModel';
import { classInfoForCard } from './equivalence';

const TURN_ORDER: Seat[] = ['N', 'E', 'S', 'W'];
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

function cloneHand(hand: Hand): Hand {
  return {
    S: [...hand.S],
    H: [...hand.H],
    D: [...hand.D],
    C: [...hand.C]
  };
}

function cloneState(state: State): State {
  return {
    ...state,
    contract: { ...state.contract },
    threat: state.threat ? { threatCardIds: [...state.threat.threatCardIds], threatsBySuit: { ...state.threat.threatsBySuit } } : null,
    threatLabels: state.threatLabels
      ? {
          E: { busy: new Set(state.threatLabels.E.busy), idle: new Set(state.threatLabels.E.idle) },
          W: { busy: new Set(state.threatLabels.W.busy), idle: new Set(state.threatLabels.W.idle) }
        }
      : null,
    cardRoles: { ...state.cardRoles },
    hands: {
      N: cloneHand(state.hands.N),
      E: cloneHand(state.hands.E),
      S: cloneHand(state.hands.S),
      W: cloneHand(state.hands.W)
    },
    trick: state.trick.map((p) => ({ ...p })),
    trickClassIds: [...state.trickClassIds],
    tricksWon: { ...state.tricksWon },
    rng: { ...state.rng },
    goal: { ...state.goal },
    userControls: [...state.userControls],
    policies: { ...state.policies },
    preferredDiscards: {
      N: state.preferredDiscards.N ? [...state.preferredDiscards.N] : undefined,
      E: state.preferredDiscards.E ? [...state.preferredDiscards.E] : undefined,
      S: state.preferredDiscards.S ? [...state.preferredDiscards.S] : undefined,
      W: state.preferredDiscards.W ? [...state.preferredDiscards.W] : undefined
    },
    preferredDiscardUsed: { ...state.preferredDiscardUsed },
    replay: {
      enabled: state.replay.enabled,
      transcript: state.replay.transcript
        ? {
            problemId: state.replay.transcript.problemId,
            seed: state.replay.transcript.seed,
            decisions: state.replay.transcript.decisions.map((d) => ({
              ...d,
              bucketCards: [...d.bucketCards],
              sameBucketAlternativeClassIds: [...d.sameBucketAlternativeClassIds],
              representativeCardByClass: { ...d.representativeCardByClass }
            })),
            userPlays: state.replay.transcript.userPlays.map((u) => ({ ...u }))
          }
        : null,
      cursor: state.replay.cursor,
      divergenceIndex: state.replay.divergenceIndex,
      forcedCard: state.replay.forcedCard,
      forcedClassId: state.replay.forcedClassId
    }
  };
}

function nextSeat(seat: Seat): Seat {
  const i = TURN_ORDER.indexOf(seat);
  return TURN_ORDER[(i + 1) % TURN_ORDER.length];
}

function seatSide(seat: Seat): 'NS' | 'EW' {
  return seat === 'N' || seat === 'S' ? 'NS' : 'EW';
}

function allHandsEmpty(hands: Record<Seat, Hand>): boolean {
  return TURN_ORDER.every((seat) => SUITS.every((suit) => hands[seat][suit].length === 0));
}

function threatCardOccurrenceCount(hands: Problem['hands'], cardId: CardId): number {
  const { suit, rank } = parseCardId(cardId);
  let count = 0;
  for (const seat of TURN_ORDER) {
    if (hands[seat][suit].includes(rank)) count += 1;
  }
  return count;
}

function assertValidExplicitThreats(problem: Problem): CardId[] {
  const rawThreats = problem.threatCardIds;
  if (!rawThreats || rawThreats.length === 0) {
    throw new Error('ThreatProblem requires explicit threatCardIds.');
  }

  const invalidThreats: string[] = [];
  for (const raw of rawThreats) {
    try {
      const { suit, rank } = parseCardId(raw);
      const canonical = toCardId(suit, rank) as CardId;
      if (threatCardOccurrenceCount(problem.hands, canonical) !== 1) {
        invalidThreats.push(raw);
      }
    } catch {
      invalidThreats.push(raw);
    }
  }

  if (invalidThreats.length > 0) {
    throw new Error(`Invalid threatCardIds: ${invalidThreats.join(', ')}`);
  }

  return [...rawThreats];
}

function evaluateGoal(goal: Goal, tricksWon: { NS: number; EW: number }): boolean {
  if (goal.type === 'minTricks') {
    return tricksWon[goal.side] >= goal.n;
  }
  return false;
}

function randomUnit(rng: State['rng']): number {
  const x0 = (rng.seed + Math.imul(rng.counter, 0x9e3779b9)) >>> 0;
  let x = x0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  rng.counter += 1;
  return x / 0x100000000;
}

function pickRandomIndex(length: number, rng: State['rng']): number {
  return Math.floor(randomUnit(rng) * length);
}

function resolveTrickWinner(trick: Play[], trumpSuit: Suit | null): Seat {
  const leadSuit = trick[0].suit;
  const trumps = trumpSuit ? trick.filter((p) => p.suit === trumpSuit) : [];
  const candidates = trumps.length > 0 ? trumps : trick.filter((p) => p.suit === leadSuit);

  let winner = candidates[0];
  for (const play of candidates) {
    if (RANK_STRENGTH[play.rank] > RANK_STRENGTH[winner.rank]) {
      winner = play;
    }
  }
  return winner.seat;
}

function removeCard(hand: Hand, suit: Suit, rank: Rank): boolean {
  const idx = hand[suit].indexOf(rank);
  if (idx < 0) return false;
  hand[suit].splice(idx, 1);
  return true;
}

function isUserTurn(state: State): boolean {
  return state.userControls.includes(state.turn);
}

function chooseUniformLegal(state: State): Play | null {
  const plays = legalPlays(state);
  if (plays.length === 0) return null;
  const idx = pickRandomIndex(plays.length, state.rng);
  if (!Number.isFinite(idx) || idx < 0 || idx >= plays.length) return plays[0];
  return plays[idx] ?? plays[0];
}

type PreferredDiscardDecision = {
  preferred: CardId[];
  applied: boolean;
  chosen?: CardId;
  reason: 'applied' | 'not-discard' | 'can-follow-suit' | 'already-used' | 'not-in-hand' | 'not-legal';
};

type AutoChoice = {
  play: Play | null;
  preferredDiscard?: PreferredDiscardDecision;
  chosenBucket?: string;
  bucketCards?: CardId[];
  policyClassByCard?: Record<string, string>;
  tierBuckets?: Partial<Record<'tier2a' | 'tier2b' | 'tier3a' | 'tier3b', CardId[]>>;
  decisionSig?: string;
  replay?: { action: 'forced' | 'disabled'; index?: number; reason?: 'sig-mismatch' | 'card-not-legal'; card?: CardId };
};

function decisionSignature(state: State): string {
  const seat = state.turn;
  const leadSuit = state.trick[0]?.suit ?? '-';
  const trump = state.contract.strain;
  const legal = legalPlays(state)
    .map((p) => classInfoForCard(state, p.seat, toCardId(p.suit, p.rank)).classId)
    .sort()
    .join(',');
  const trick = state.trickClassIds.join(',');
  return `seat=${seat}|lead=${leadSuit}|trump=${trump}|legal=${legal}|trick=${trick}`;
}

function normalizePreferred(problem: Problem): Partial<Record<Seat, CardId[]>> {
  const out: Partial<Record<Seat, CardId[]>> = {};
  for (const seat of TURN_ORDER) {
    const raw = problem.preferredDiscards?.[seat];
    if (!raw) continue;
    out[seat] = Array.isArray(raw) ? [...raw] : [raw];
  }
  return out;
}

function evaluatePreferredDiscard(state: State): PreferredDiscardDecision | null {
  const seat = state.turn;
  const preferred = state.preferredDiscards[seat];
  if (!preferred || preferred.length === 0) return null;

  const leadSuit = state.trick[0]?.suit ?? null;
  if (!leadSuit) {
    return { preferred, applied: false, reason: 'not-discard' };
  }

  if (state.hands[seat][leadSuit].length > 0) {
    return { preferred, applied: false, reason: 'can-follow-suit' };
  }

  if (state.preferredDiscardUsed[seat]) {
    return { preferred, applied: false, reason: 'already-used' };
  }

  const legal = legalPlays(state).map((p) => toCardId(p.suit, p.rank) as CardId);
  const inHand = new Set<CardId>();
  for (const suit of SUITS) {
    for (const rank of state.hands[seat][suit]) {
      inHand.add(toCardId(suit, rank) as CardId);
    }
  }

  for (const cardId of preferred) {
    if (!inHand.has(cardId)) continue;
    if (!legal.includes(cardId)) {
      return { preferred, applied: false, chosen: cardId, reason: 'not-legal' };
    }
    return { preferred, applied: true, chosen: cardId, reason: 'applied' };
  }

  return { preferred, applied: false, reason: 'not-in-hand' };
}

function buildPolicyClassByCard(
  state: State,
  seat: Seat,
  chosenBucket: string | undefined,
  bucketCards: CardId[] | undefined
): Record<string, string> | undefined {
  if (!bucketCards || bucketCards.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const card of bucketCards) {
    const defaultClass = classInfoForCard(state, seat, card).classId;
    if (!chosenBucket || !chosenBucket.startsWith('tier')) {
      out[card] = defaultClass;
    } else if (chosenBucket.startsWith('tier1')) {
      out[card] = 'idle:tier1';
    } else if (chosenBucket.startsWith('tier2') || chosenBucket.startsWith('tier3')) {
      out[card] = `busy:${card[0]}`;
    } else {
      out[card] = `other:${card[0]}`;
    }
  }
  return out;
}

function chooseAutoplay(state: State, policy: Policy): AutoChoice {
  const isDefender = state.turn === 'E' || state.turn === 'W';
  const decisionSig = isDefender ? decisionSignature(state) : undefined;
  let replayNote: AutoChoice['replay'];

  if (isDefender && state.replay.enabled && state.replay.transcript) {
    const rec = state.replay.transcript.decisions[state.replay.cursor];
    if (!rec) {
      state.replay.enabled = false;
    } else if (rec.sig !== decisionSig) {
      state.replay.enabled = false;
      replayNote = { action: 'disabled', index: rec.index, reason: 'sig-mismatch', card: rec.chosenCard };
    } else {
      const legal = legalPlays(state);
      const isDivergence = state.replay.divergenceIndex !== null && state.replay.cursor === state.replay.divergenceIndex;
      const legalCardIds = legal.map((p) => toCardId(p.suit, p.rank));
      const altClassByCard = buildPolicyClassByCard(state, state.turn, rec.chosenBucket, legalCardIds);
      let forced: Play | undefined;
      let forceCard: CardId = rec.chosenCard;
      let forcedClassFailed = false;
      if (isDivergence && state.replay.forcedClassId) {
        const match = legal.find((p) => altClassByCard[toCardId(p.suit, p.rank)] === state.replay.forcedClassId);
        if (match) {
          forced = match;
          forceCard = toCardId(match.suit, match.rank);
        } else {
          state.replay.enabled = false;
          replayNote = {
            action: 'disabled',
            index: rec.index,
            reason: 'class-not-legal',
            card: rec.chosenCard,
            forcedClassId: state.replay.forcedClassId
          };
          forcedClassFailed = true;
        }
      }
      if (!forced && !forcedClassFailed) {
        forceCard = isDivergence && state.replay.forcedCard ? state.replay.forcedCard : rec.chosenCard;
        forced = legal.find((p) => toCardId(p.suit, p.rank) === forceCard);
      }
      if (!forced && !forcedClassFailed) {
        const fallback = legal.find((p) => classInfoForCard(state, p.seat, toCardId(p.suit, p.rank)).classId === rec.chosenClassId);
        if (!fallback) {
          state.replay.enabled = false;
          replayNote = { action: 'disabled', index: rec.index, reason: 'card-not-legal', card: forceCard };
        } else {
          state.replay.cursor += 1;
          const chosenBucket = rec.chosenBucket;
          const bucketCards = [...rec.bucketCards];
          const policyClassByCard = buildPolicyClassByCard(state, state.turn, chosenBucket, bucketCards);
          if (isDivergence) state.replay.enabled = false;
          return {
            play: fallback,
            decisionSig,
            chosenBucket,
            bucketCards,
            policyClassByCard,
            replay: { action: 'forced', index: rec.index, card: toCardId(fallback.suit, fallback.rank) }
          };
        }
      } else {
        state.replay.cursor += 1;
        const chosenBucket = rec.chosenBucket;
        const bucketCards = [...rec.bucketCards];
        const policyClassByCard = buildPolicyClassByCard(state, state.turn, chosenBucket, bucketCards);
        if (isDivergence) {
          state.replay.enabled = false;
        }
        return { play: forced, decisionSig, chosenBucket, bucketCards, policyClassByCard, replay: { action: 'forced', index: rec.index, card: forceCard } };
      }
    }
  }

  const pref = evaluatePreferredDiscard(state);
  if (pref?.applied && pref.chosen) {
    state.preferredDiscardUsed[state.turn] = true;
    const { suit, rank } = parseCardId(pref.chosen);
    const bucketCards: CardId[] = [pref.chosen];
    const chosenBucket = 'preferred';
    const policyClassByCard = buildPolicyClassByCard(state, state.turn, chosenBucket, bucketCards);
    return {
      play: { seat: state.turn, suit, rank },
      preferredDiscard: pref,
      chosenBucket,
      bucketCards,
      policyClassByCard,
      decisionSig,
      replay: replayNote
    };
  }

  if (policy.kind === 'randomLegal') {
    const legal = legalPlays(state);
    const chosenBucket = 'legal';
    const bucketCards = legal.map((p) => toCardId(p.suit, p.rank));
    const policyClassByCard = isDefender ? buildPolicyClassByCard(state, state.turn, chosenBucket, bucketCards) : undefined;
    return {
      play: chooseUniformLegal(state),
      preferredDiscard: pref ?? undefined,
      chosenBucket,
      bucketCards,
      policyClassByCard,
      decisionSig,
      replay: replayNote
    };
  }

  if (policy.kind !== 'threatAware') return { play: null, preferredDiscard: pref ?? undefined, decisionSig, replay: replayNote };
  if (state.turn !== 'E' && state.turn !== 'W') return { play: chooseUniformLegal(state), preferredDiscard: pref ?? undefined, decisionSig, replay: replayNote };

  const leadSuit = state.trick[0]?.suit ?? null;
  if (!leadSuit) {
    const legal = legalPlays(state);
    const chosenBucket = 'lead:none';
    const bucketCards = legal.map((p) => toCardId(p.suit, p.rank));
    const policyClassByCard = buildPolicyClassByCard(state, state.turn, chosenBucket, bucketCards);
    return {
      play: chooseUniformLegal(state),
      preferredDiscard: pref ?? undefined,
      chosenBucket,
      bucketCards,
      policyClassByCard,
      decisionSig,
      replay: replayNote
    };
  }
  if (state.hands[state.turn][leadSuit].length > 0) {
    const inSuit = legalPlays(state);
    if (!state.threat || !state.threatLabels) {
      const chosenBucket = 'follow:baseline';
      const bucketCards = inSuit.map((p) => toCardId(p.suit, p.rank));
      const policyClassByCard = buildPolicyClassByCard(state, state.turn, chosenBucket, bucketCards);
      return {
        play: chooseUniformLegal(state),
        preferredDiscard: pref ?? undefined,
        chosenBucket,
        bucketCards,
        policyClassByCard,
        decisionSig,
        replay: replayNote
      };
    }
    const threshold = getIdleThreatThresholdRank(leadSuit, state.threat, state.threatLabels as DefenderLabels);
    if (!threshold) {
      const chosenBucket = 'follow:baseline';
      const bucketCards = inSuit.map((p) => toCardId(p.suit, p.rank));
      const policyClassByCard = buildPolicyClassByCard(state, state.turn, chosenBucket, bucketCards);
      return {
        play: chooseUniformLegal(state),
        preferredDiscard: pref ?? undefined,
        chosenBucket,
        bucketCards,
        policyClassByCard,
        decisionSig,
        replay: replayNote
      };
    }
    const below = inSuit.filter((p) => RANK_STRENGTH[p.rank] < RANK_STRENGTH[threshold]);
    const above = inSuit.filter((p) => RANK_STRENGTH[p.rank] >= RANK_STRENGTH[threshold]);
    const bucket = below.length > 0 ? below : above;
    const idx = pickRandomIndex(bucket.length, state.rng);
    const selected = bucket[idx] ?? bucket[0] ?? inSuit[0] ?? null;
    const chosenBucket = below.length > 0 ? 'follow:below' : 'follow:above';
    const bucketCards = bucket.map((p) => toCardId(p.suit, p.rank));
    const policyClassByCard = buildPolicyClassByCard(state, state.turn, chosenBucket, bucketCards);
    return {
      play: selected,
      preferredDiscard: pref ?? undefined,
      chosenBucket,
      bucketCards,
      policyClassByCard,
      decisionSig,
      replay: replayNote
    };
  }

  if (!state.threat) {
    return { play: null, preferredDiscard: pref ?? undefined, decisionSig, replay: replayNote };
  }

  const labels: DefenderLabels =
    state.threatLabels ??
    {
      E: { busy: new Set(), idle: new Set() },
      W: { busy: new Set(), idle: new Set() }
    };
  const tiers = computeDiscardTiers(state.turn, { hands: state.hands }, leadSuit, state.threat, labels);
  const ordered: Array<{ name: string; cards: CardId[] }> = [
    { name: 'tier1a', cards: tiers.tier1a },
    { name: 'tier1b', cards: tiers.tier1b },
    { name: 'tier1c', cards: tiers.tier1c },
    { name: 'tier2a', cards: tiers.tier2a },
    { name: 'tier2b', cards: tiers.tier2b },
    { name: 'tier3a', cards: tiers.tier3a },
    { name: 'tier3b', cards: tiers.tier3b },
    { name: 'tier4', cards: tiers.tier4 }
  ];
  const chosenBucket = ordered.find((o) => o.cards.length > 0) ?? { name: 'tier4', cards: tiers.tier4 };
  const idx = pickRandomIndex(chosenBucket.cards.length, state.rng);
  const chosen = chosenBucket.cards[idx] ?? chosenBucket.cards[0];
  const { suit, rank } = parseCardId(chosen);
  const policyClassByCard = buildPolicyClassByCard(state, state.turn, chosenBucket.name, chosenBucket.cards) ?? {};
  for (const card of [...tiers.tier2a, ...tiers.tier2b, ...tiers.tier3a, ...tiers.tier3b]) {
    policyClassByCard[card] = `busy:${card[0]}`;
  }
  const tierBuckets: Partial<Record<'tier2a' | 'tier2b' | 'tier3a' | 'tier3b', CardId[]>> = {};
  if (tiers.tier2a.length > 0) tierBuckets.tier2a = [...tiers.tier2a];
  if (tiers.tier2b.length > 0) tierBuckets.tier2b = [...tiers.tier2b];
  if (tiers.tier3a.length > 0) tierBuckets.tier3a = [...tiers.tier3a];
  if (tiers.tier3b.length > 0) tierBuckets.tier3b = [...tiers.tier3b];
  return {
    play: { seat: state.turn, suit, rank },
    preferredDiscard: pref ?? undefined,
    chosenBucket: chosenBucket.name,
    bucketCards: [...chosenBucket.cards],
    policyClassByCard,
    tierBuckets,
    decisionSig,
    replay: replayNote
  };
}


function applyOnePlay(
  state: State,
  play: Play,
  eventType: 'played' | 'autoplay',
  preferredDiscard?: PreferredDiscardDecision,
  chosenBucket?: string,
  bucketCards?: CardId[],
  policyClassByCard?: Record<string, string>,
  tierBuckets?: Partial<Record<'tier2a' | 'tier2b' | 'tier3a' | 'tier3b', CardId[]>>,
  decisionSig?: string,
  replay?: { action: 'forced' | 'disabled'; index?: number; reason?: 'sig-mismatch' | 'card-not-legal'; card?: CardId }
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const playedId = toCardId(play.suit, play.rank) as CardId;
  const playedClass = classInfoForCard(state, play.seat, playedId).classId;
  const ok = removeCard(state.hands[play.seat], play.suit, play.rank);
  if (!ok) {
    events.push({ type: 'illegal', reason: `Card ${play.suit}${play.rank} not in ${play.seat} hand` });
    return events;
  }

  state.trick.push({ ...play });
  state.trickClassIds.push(`${play.seat}:${playedClass}`);
  if (eventType === 'autoplay') {
    events.push({ type: eventType, play: { ...play }, preferredDiscard, chosenBucket, bucketCards, policyClassByCard, tierBuckets, decisionSig, replay });
  } else {
    events.push({ type: eventType, play: { ...play } });
  }

  if (state.threat && state.threatLabels) {
    const updated = updateClassificationAfterPlay(
      {
        threat: state.threat,
        labels: state.threatLabels,
        perCardRole: state.cardRoles
      },
      { hands: state.hands },
      toCardId(play.suit, play.rank) as CardId
    );
    state.threat = updated.threat as State['threat'];
    state.threatLabels = updated.labels as State['threatLabels'];
    state.cardRoles = { ...updated.perCardRole };
  }

  if (state.trick.length < 4) {
    state.turn = nextSeat(state.turn);
    return events;
  }

  const completedTrick = state.trick.map((p) => ({ ...p }));
  const winner = resolveTrickWinner(completedTrick, state.trumpSuit);
  const winnerSide = seatSide(winner);
  state.tricksWon[winnerSide] += 1;
  state.trick = [];
  state.trickClassIds = [];
  state.leader = winner;
  state.turn = winner;
  events.push({ type: 'trickComplete', winner, trick: completedTrick });

  if (allHandsEmpty(state.hands)) {
    state.phase = 'end';
    events.push({ type: 'handComplete', success: evaluateGoal(state.goal, state.tricksWon), tricksWon: { ...state.tricksWon } });
  }

  return events;
}

export function init(problem: Problem): State {
  const trumpSuit: Suit | null = problem.contract.strain === 'NT' ? null : problem.contract.strain;
  const usesThreatAware = Object.values(problem.policies).some((p) => p?.kind === 'threatAware');
  let threat: State['threat'] = null;
  let threatLabels: State['threatLabels'] = null;
  let cardRoles: State['cardRoles'] = {};
  if (usesThreatAware) {
    const explicitThreats = assertValidExplicitThreats(problem);
    const classification = initClassification({ hands: problem.hands }, explicitThreats);
    threat = classification.threat as State['threat'];
    threatLabels = classification.labels as State['threatLabels'];
    cardRoles = { ...classification.perCardRole };
  } else if (problem.threatCardIds && problem.threatCardIds.length > 0) {
    const explicitThreats = assertValidExplicitThreats(problem);
    const classification = initClassification({ hands: problem.hands }, explicitThreats);
    threat = classification.threat as State['threat'];
    threatLabels = classification.labels as State['threatLabels'];
    cardRoles = { ...classification.perCardRole };
  }
  const state: State = {
    id: problem.id,
    contract: { ...problem.contract },
    trumpSuit,
    threat,
    threatLabels,
    cardRoles,
    hands: {
      N: cloneHand(problem.hands.N),
      E: cloneHand(problem.hands.E),
      S: cloneHand(problem.hands.S),
      W: cloneHand(problem.hands.W)
    },
    leader: problem.leader,
    turn: problem.leader,
    trick: [],
    trickClassIds: [],
    tricksWon: { NS: 0, EW: 0 },
    phase: 'awaitUser',
    rng: { seed: problem.rngSeed >>> 0, counter: 0 },
    goal: { ...problem.goal },
    userControls: [...problem.userControls],
    policies: { ...problem.policies },
    preferredDiscards: normalizePreferred(problem),
    preferredDiscardUsed: {},
    replay: { enabled: false, transcript: null, cursor: 0, divergenceIndex: null, forcedCard: null, forcedClassId: null }
  };

  if (allHandsEmpty(state.hands)) {
    state.phase = 'end';
  } else {
    state.phase = isUserTurn(state) ? 'awaitUser' : 'auto';
  }

  return state;
}

export function legalPlays(state: State): Play[] {
  if (state.phase === 'end') return [];

  const hand = state.hands[state.turn];
  const leadSuit = state.trick[0]?.suit;

  const leadRanks = leadSuit ? (hand[leadSuit] ?? []) : [];
  const candidateSuits =
    leadSuit && leadRanks.length > 0 ? [leadSuit] : SUITS;

  const plays: Play[] = [];
  for (const suit of candidateSuits) {
    const ranks = hand[suit] ?? [];
    for (const rank of ranks) {
      plays.push({ seat: state.turn, suit, rank });
    }
  }
  return plays;
}


export function apply(state: State, play: Play): { state: State; events: EngineEvent[] } {
  const next = cloneState(state);
  const events: EngineEvent[] = [];

  if (next.phase === 'end') {
    events.push({ type: 'illegal', reason: 'Hand already complete' });
    return { state: next, events };
  }

  if (play.seat !== next.turn) {
    events.push({ type: 'illegal', reason: `Expected turn ${next.turn}, got ${play.seat}` });
    next.phase = isUserTurn(next) ? 'awaitUser' : 'auto';
    return { state: next, events };
  }

  const legal = legalPlays(next);
  const allowed = legal.some((p) => p.seat === play.seat && p.suit === play.suit && p.rank === play.rank);
  if (!allowed) {
    events.push({ type: 'illegal', reason: `Illegal play ${play.seat}:${play.suit}${play.rank}` });
    next.phase = isUserTurn(next) ? 'awaitUser' : 'auto';
    return { state: next, events };
  }

  events.push(...applyOnePlay(next, play, 'played'));

  while (!isUserTurn(next)) {
    if (allHandsEmpty(next.hands)) break;
    next.phase = 'auto';
    const policy = next.policies[next.turn];
    if (!policy) {
      events.push({ type: 'illegal', reason: `No policy configured for auto seat ${next.turn}` });
      break;
    }
    const auto = chooseAutoplay(next, policy);
    if (!auto.play) {
      const legalNow = legalPlays(next);
      events.push({
        type: 'illegal',
        reason: `Autoplay failed for ${next.turn} (policy=${(policy as any)?.kind ?? 'none'}, legal=${legalNow.length}${auto.replay?.reason ? `, replay=${auto.replay.reason}` : ''})`,
      });
      break;
    }

    events.push(
      ...applyOnePlay(
        next,
        auto.play,
        'autoplay',
        auto.preferredDiscard,
        auto.chosenBucket,
        auto.bucketCards,
        auto.policyClassByCard,
        auto.tierBuckets,
        auto.decisionSig,
        auto.replay
      )
    );
  }

  if (allHandsEmpty(next.hands)) {
    next.phase = 'end';
    return { state: next, events };
  }

  next.phase = isUserTurn(next) ? 'awaitUser' : 'auto';

  return { state: next, events };
}
