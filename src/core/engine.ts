import type { EngineEvent, Goal, Hand, Play, Policy, Problem, Rank, Seat, State, Suit } from './types';
import { evaluatePolicy } from '../ai/evaluatePolicy';
import { initClassification, parseCardId, toCardId, updateClassificationAfterPlay, type CardId } from '../ai/threatModel';
import { classInfoForCard } from './equivalence';
import { computeGoalStatus, remainingTricksFromHands } from './goal';
import type { SemanticEventCollector, SemanticEventInput, SemanticTag } from './semanticEvents';
import { cardRoleToSemanticTag } from './semanticEvents';

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
    goalStatus: state.goalStatus,
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

function refreshGoalStatus(state: State): void {
  state.goalStatus = computeGoalStatus(state.goal, state.tricksWon, remainingTricksFromHands(state.hands));
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
  tierBuckets?: Partial<Record<'tier3a' | 'tier3b' | 'tier4a' | 'tier4b', CardId[]>>;
  ddPolicy?: {
    mode: 'strict';
    source: 'runtime';
    problemId: string;
    signature: string;
    baseCandidates: CardId[];
    allowedCandidates: CardId[];
    optimalMoves: CardId[];
    bound: boolean;
    fallback: boolean;
    path: 'intersection' | 'dd-fallback' | 'base-fallback';
  };
  decisionSig?: string;
  replay?: {
    action: 'forced' | 'disabled';
    index?: number;
    reason?: 'sig-mismatch' | 'card-not-legal' | 'class-not-legal';
    card?: CardId;
    forcedClassId?: string;
  };
};

type ApplyOptions = {
  eventCollector?: SemanticEventCollector;
};

export type EngineRunInput = {
  state: State;
  play: Play;
  eventCollector?: SemanticEventCollector;
};

function emitSemantic(collector: SemanticEventCollector | undefined, event: SemanticEventInput): void {
  collector?.emit(event);
}

function semanticTagsForBucket(bucket: string | undefined): SemanticTag[] {
  if (!bucket) return [];
  if (bucket.startsWith('tier1') || bucket === 'follow:idle-cheap-win') return ['tier1', 'idle'];
  if (bucket === 'tier2') return ['tier2'];
  if (bucket.startsWith('tier3')) return ['tier3', 'busy'];
  if (bucket.startsWith('tier4')) return ['tier4', 'busy'];
  if (bucket.startsWith('tier5')) return ['tier5'];
  return [];
}

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

function chooseAutoplay(state: State, policy: Policy, collector?: SemanticEventCollector): AutoChoice {
  const isDefender = state.turn === 'E' || state.turn === 'W';
  const decisionSig = isDefender ? decisionSignature(state) : undefined;
  let replayNote: AutoChoice['replay'];
  emitSemantic(collector, {
    type: 'decision-start',
    seat: state.turn,
    details: {
      policyKind: policy.kind,
      legalCount: legalPlays(state).length
    }
  });

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
    if (!isDefender) {
      const legal = legalPlays(state);
      const chosenBucket = 'legal';
      const bucketCards = legal.map((p) => toCardId(p.suit, p.rank));
      return {
        play: chooseUniformLegal(state),
        preferredDiscard: pref ?? undefined,
        chosenBucket,
        bucketCards,
        decisionSig,
        replay: replayNote
      };
    }
    const evaluated = evaluatePolicy({
      policy,
      seat: state.turn,
      problemId: state.id,
      contractStrain: state.contract.strain,
      hands: state.hands,
      trick: state.trick,
      threat: state.threat as any,
      threatLabels: state.threatLabels as any,
      rng: state.rng
    });
    state.rng = { ...evaluated.rngAfter };
    if (!evaluated.chosenCardId) return { play: null, preferredDiscard: pref ?? undefined, decisionSig, replay: replayNote };
    const { suit, rank } = parseCardId(evaluated.chosenCardId);
    const legal = legalPlays(state);
    return {
      play: { seat: state.turn, suit, rank },
      preferredDiscard: pref ?? undefined,
      chosenBucket: evaluated.chosenBucket ?? 'legal',
      bucketCards: evaluated.bucketCards ?? legal.map((p) => toCardId(p.suit, p.rank)),
      policyClassByCard: evaluated.policyClassByCard,
      ddPolicy: evaluated.ddPolicy,
      decisionSig,
      replay: replayNote
    };
  }

  if (policy.kind !== 'threatAware') return { play: null, preferredDiscard: pref ?? undefined, decisionSig, replay: replayNote };
  if (state.turn !== 'E' && state.turn !== 'W') return { play: chooseUniformLegal(state), preferredDiscard: pref ?? undefined, decisionSig, replay: replayNote };
  const evaluated = evaluatePolicy({
    policy,
    seat: state.turn,
    problemId: state.id,
    contractStrain: state.contract.strain,
    hands: state.hands,
    trick: state.trick,
    threat: state.threat as any,
    threatLabels: state.threatLabels as any,
    rng: state.rng
  });
  state.rng = { ...evaluated.rngAfter };
  if (!evaluated.chosenCardId) {
    return { play: null, preferredDiscard: pref ?? undefined, decisionSig, replay: replayNote };
  }
  const { suit, rank } = parseCardId(evaluated.chosenCardId);
  return {
    play: { seat: state.turn, suit, rank },
    preferredDiscard: pref ?? undefined,
    chosenBucket: evaluated.chosenBucket,
    bucketCards: evaluated.bucketCards,
    policyClassByCard: evaluated.policyClassByCard,
    tierBuckets: evaluated.tierBuckets,
    ddPolicy: evaluated.ddPolicy,
    decisionSig,
    replay: replayNote
  };
}


function applyOnePlay(
  state: State,
  play: Play,
  collector: SemanticEventCollector | undefined,
  eventType: 'played' | 'autoplay',
  preferredDiscard?: PreferredDiscardDecision,
  chosenBucket?: string,
  bucketCards?: CardId[],
  policyClassByCard?: Record<string, string>,
  tierBuckets?: Partial<Record<'tier3a' | 'tier3b' | 'tier4a' | 'tier4b', CardId[]>>,
  ddPolicy?: {
    mode: 'strict';
    source: 'runtime';
    problemId: string;
    signature: string;
    baseCandidates: CardId[];
    allowedCandidates: CardId[];
    optimalMoves: CardId[];
    bound: boolean;
    fallback: boolean;
    path: 'intersection' | 'dd-fallback' | 'base-fallback';
  },
  decisionSig?: string,
  replay?: {
    action: 'forced' | 'disabled';
    index?: number;
    reason?: 'sig-mismatch' | 'card-not-legal' | 'class-not-legal';
    card?: CardId;
    forcedClassId?: string;
  }
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
  emitSemantic(collector, {
    type: 'card-played',
    seat: play.seat,
    card: playedId,
    suit: play.suit,
    rank: play.rank,
    tags: playedClass.startsWith('busy:') ? ['busy'] : playedClass.startsWith('idle:') ? ['idle'] : [],
    details: { classId: playedClass, eventType }
  });
  if (eventType === 'autoplay') {
    events.push({ type: eventType, play: { ...play }, preferredDiscard, chosenBucket, bucketCards, policyClassByCard, tierBuckets, ddPolicy, decisionSig, replay });
  } else {
    events.push({ type: eventType, play: { ...play } });
  }

  if (state.threat && state.threatLabels) {
    const beforeThreat = state.threat;
    const beforeRoles = state.cardRoles;
    const updated = updateClassificationAfterPlay(
      {
        threat: state.threat,
        labels: state.threatLabels,
        perCardRole: state.cardRoles
      },
      { hands: state.hands },
      toCardId(play.suit, play.rank) as CardId,
      {
        trick: state.trick,
        trumpSuit: state.trumpSuit,
        goal: state.goal,
        tricksWon: state.tricksWon,
        goalStatus: state.goalStatus
      }
    );
    state.threat = updated.threat as State['threat'];
    state.threatLabels = updated.labels as State['threatLabels'];
    state.cardRoles = { ...updated.perCardRole };
    emitSemantic(collector, {
      type: 'threat-updated',
      seat: play.seat,
      card: playedId,
      suit: play.suit,
      rank: play.rank,
      details: {
        before: beforeThreat,
        after: updated.threat
      }
    });
    const changedRoles: Array<{ card: CardId; before?: string; after?: string }> = [];
    const roleKeys = new Set<string>([...Object.keys(beforeRoles), ...Object.keys(updated.perCardRole)]);
    for (const key of roleKeys) {
      const before = beforeRoles[key as CardId];
      const after = updated.perCardRole[key as CardId];
      if (before !== after) changedRoles.push({ card: key as CardId, before, after });
    }
    emitSemantic(collector, {
      type: 'classifications-updated',
      tags: changedRoles
        .flatMap((item) => [cardRoleToSemanticTag(item.before as any), cardRoleToSemanticTag(item.after as any)])
        .filter((tag): tag is SemanticTag => Boolean(tag)),
      details: { changedRoles }
    });
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
  refreshGoalStatus(state);

  if (state.goalStatus !== 'live') {
    state.phase = 'end';
    events.push({ type: 'handComplete', success: evaluateGoal(state.goal, state.tricksWon), tricksWon: { ...state.tricksWon } });
    return events;
  }

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
    goalStatus: 'live',
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
  refreshGoalStatus(state);

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


export function apply(state: State, play: Play, options?: ApplyOptions): { state: State; events: EngineEvent[] } {
  const next = cloneState(state);
  const events: EngineEvent[] = [];
  const collector = options?.eventCollector;

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

  emitSemantic(collector, {
    type: 'decision-chosen',
    seat: play.seat,
    card: toCardId(play.suit, play.rank) as CardId,
    suit: play.suit,
    rank: play.rank,
    details: { source: 'user' }
  });
  events.push(...applyOnePlay(next, play, collector, 'played'));

  while (next.phase !== 'end' && !isUserTurn(next)) {
    if (allHandsEmpty(next.hands)) break;
    next.phase = 'auto';
    const policy = next.policies[next.turn];
    if (!policy) {
      events.push({ type: 'illegal', reason: `No policy configured for auto seat ${next.turn}` });
      break;
    }
    const auto = chooseAutoplay(next, policy, collector);
    if (!auto.play) {
      const legalNow = legalPlays(next);
      events.push({
        type: 'illegal',
        reason: `Autoplay failed for ${next.turn} (policy=${(policy as any)?.kind ?? 'none'}, legal=${legalNow.length}${auto.replay?.reason ? `, replay=${auto.replay.reason}` : ''})`,
      });
      break;
    }
    emitSemantic(collector, {
      type: 'decision-evaluated',
      seat: next.turn,
      card: auto.play ? (toCardId(auto.play.suit, auto.play.rank) as CardId) : undefined,
      tags: semanticTagsForBucket(auto.chosenBucket),
      details: {
        chosenBucket: auto.chosenBucket,
        bucketCards: auto.bucketCards,
        policyClassByCard: auto.policyClassByCard,
        tierBuckets: auto.tierBuckets
      }
    });
    emitSemantic(collector, {
      type: 'decision-chosen',
      seat: auto.play.seat,
      card: toCardId(auto.play.suit, auto.play.rank) as CardId,
      suit: auto.play.suit,
      rank: auto.play.rank,
      tags: semanticTagsForBucket(auto.chosenBucket),
      details: {
        chosenBucket: auto.chosenBucket,
        ddPolicy: auto.ddPolicy,
        decisionSig: auto.decisionSig
      }
    });

    events.push(
      ...applyOnePlay(
        next,
        auto.play,
        collector,
        'autoplay',
        auto.preferredDiscard,
        auto.chosenBucket,
        auto.bucketCards,
        auto.policyClassByCard,
        auto.tierBuckets,
        auto.ddPolicy,
        auto.decisionSig,
        auto.replay
      )
    );
  }

  if (next.phase === 'end') {
    return { state: next, events };
  }

  if (allHandsEmpty(next.hands)) {
    next.phase = 'end';
    return { state: next, events };
  }

  next.phase = isUserTurn(next) ? 'awaitUser' : 'auto';

  return { state: next, events };
}

export function run(input: EngineRunInput): { state: State; events: EngineEvent[] } {
  return apply(input.state, input.play, { eventCollector: input.eventCollector });
}
