/// <reference types="node" />

import { initClassification, updateClassificationAfterPlay, type CardId, type ClassificationState, type Position } from '../ai/threatModel';
import { buildFeatureStateFromRuntime, diffFeatureStates } from '../ai/features';
import type { Goal, Hand, Rank, Seat, State, Suit } from '../core';

type JsonLabels = {
  E: { busy: CardId[]; idle: CardId[] };
  W: { busy: CardId[]; idle: CardId[] };
};

type JsonState = {
  threat: ClassificationState['threat'];
  resource?: ClassificationState['resource'];
  labels: JsonLabels;
  perCardRole: ClassificationState['perCardRole'];
};

type GoalContext = {
  goal: Goal;
  tricksWon: { NS: number; EW: number };
};

type RuntimeContext = {
  trick?: Array<{ seat: Seat; suit: Suit; rank: Rank }>;
  trumpSuit?: Suit | null;
};

type InitRequest = {
  mode: 'init';
  position: Position;
  threatCardIds: CardId[];
  resourceCardIds?: CardId[];
  goalContext?: GoalContext;
  runtimeContext?: RuntimeContext;
};

type UpdateRequest = {
  mode: 'update';
  position: Position;
  state: JsonState;
  playedCardId: CardId;
  goalContext?: GoalContext;
  runtimeContext?: RuntimeContext;
};

export type ThreatStateRequest = InitRequest | UpdateRequest;

function toJsonState(state: ClassificationState): JsonState {
  return {
    threat: state.threat,
    resource: state.resource,
    labels: {
      E: { busy: [...state.labels.E.busy], idle: [...state.labels.E.idle] },
      W: { busy: [...state.labels.W.busy], idle: [...state.labels.W.idle] }
    },
    perCardRole: state.perCardRole
  };
}

function fromJsonState(state: JsonState): ClassificationState {
  return {
    threat: state.threat,
    resource: state.resource ?? { resourceCardIds: [], resourcesBySuit: {} },
    labels: {
      E: { busy: new Set(state.labels.E.busy), idle: new Set(state.labels.E.idle) },
      W: { busy: new Set(state.labels.W.busy), idle: new Set(state.labels.W.idle) }
    },
    perCardRole: state.perCardRole
  };
}

function normalizePosition(position: Position): Position {
  const seats: Seat[] = ['N', 'E', 'S', 'W'];
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  const out = {} as Record<Seat, Hand>;
  for (const seat of seats) {
    const hand = position.hands[seat];
    out[seat] = {
      S: [...(hand.S as Rank[])],
      H: [...(hand.H as Rank[])],
      D: [...(hand.D as Rank[])],
      C: [...(hand.C as Rank[])]
    };
    for (const suit of suits) out[seat][suit] = [...out[seat][suit]];
  }
  return { hands: out };
}

export function handleThreatStateRequest(req: ThreatStateRequest): { ok: true; state: JsonState; features: ReturnType<typeof buildFeatureStateFromRuntime>; featureDiff?: ReturnType<typeof diffFeatureStates> } {
  if (req.mode === 'init') {
    const state = initClassification(normalizePosition(req.position), req.threatCardIds, req.resourceCardIds ?? [], {
      trick: req.runtimeContext?.trick,
      trumpSuit: req.runtimeContext?.trumpSuit ?? null,
      goal: req.goalContext?.goal,
      tricksWon: req.goalContext?.tricksWon
    });
    const features = buildFeatureStateFromRuntime({
      threat: state.threat,
      threatLabels: state.labels as unknown as State['threatLabels'],
      cardRoles: state.perCardRole as State['cardRoles'],
      goal: req.goalContext?.goal,
      tricksWon: req.goalContext?.tricksWon,
      hands: req.position.hands as State['hands']
    });
    return { ok: true, state: toJsonState(state), features };
  }
  const prev = fromJsonState(req.state);
  const next = updateClassificationAfterPlay(prev, normalizePosition(req.position), req.playedCardId, {
    trick: req.runtimeContext?.trick,
    trumpSuit: req.runtimeContext?.trumpSuit ?? null,
    goal: req.goalContext?.goal,
    tricksWon: req.goalContext?.tricksWon
  });
  const beforeFeatures = buildFeatureStateFromRuntime({
    threat: prev.threat,
    threatLabels: prev.labels as unknown as State['threatLabels'],
    cardRoles: prev.perCardRole as State['cardRoles'],
    goal: req.goalContext?.goal,
    tricksWon: req.goalContext?.tricksWon,
    hands: req.position.hands as State['hands']
  });
  const features = buildFeatureStateFromRuntime({
    threat: next.threat,
    threatLabels: next.labels as unknown as State['threatLabels'],
    cardRoles: next.perCardRole as State['cardRoles'],
    goal: req.goalContext?.goal,
    tricksWon: req.goalContext?.tricksWon,
    hands: req.position.hands as State['hands']
  });
  const featureDiff = diffFeatureStates(beforeFeatures, features);
  return { ok: true, state: toJsonState(next), features, featureDiff };
}
