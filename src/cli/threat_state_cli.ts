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
  labels: JsonLabels;
  perCardRole: ClassificationState['perCardRole'];
};

type GoalContext = {
  goal: Goal;
  tricksWon: { NS: number; EW: number };
};

type InitRequest = {
  mode: 'init';
  position: Position;
  threatCardIds: CardId[];
  goalContext?: GoalContext;
};

type UpdateRequest = {
  mode: 'update';
  position: Position;
  state: JsonState;
  playedCardId: CardId;
  goalContext?: GoalContext;
};

type Request = InitRequest | UpdateRequest;

function toJsonState(state: ClassificationState): JsonState {
  return {
    threat: state.threat,
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
    for (const suit of suits) {
      out[seat][suit] = [...out[seat][suit]];
    }
  }
  return { hands: out };
}

async function readStdin(): Promise<string> {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main(): Promise<void> {
  try {
    const req = JSON.parse(await readStdin()) as Request;
    if (req.mode === 'init') {
      const state = initClassification(normalizePosition(req.position), req.threatCardIds);
      const features = buildFeatureStateFromRuntime({
        threat: state.threat,
        threatLabels: state.labels as unknown as State['threatLabels'],
        cardRoles: state.perCardRole as State['cardRoles'],
        goal: req.goalContext?.goal,
        tricksWon: req.goalContext?.tricksWon,
        hands: req.position.hands as State['hands']
      });
      process.stdout.write(`${JSON.stringify({ ok: true, state: toJsonState(state), features })}\n`);
      return;
    }
    const prev = fromJsonState(req.state);
    const next = updateClassificationAfterPlay(
      prev,
      normalizePosition(req.position),
      req.playedCardId
    );
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
    process.stdout.write(`${JSON.stringify({ ok: true, state: toJsonState(next), features, featureDiff })}\n`);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ ok: false, error: { message: error instanceof Error ? error.message : String(error) } })}\n`
    );
  }
}

void main();
