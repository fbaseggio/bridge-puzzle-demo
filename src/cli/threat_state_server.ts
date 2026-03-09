/// <reference types="node" />

import { initClassification, updateClassificationAfterPlay, type CardId, type ClassificationState, type Position } from '../ai/threatModel';
import { buildFeatureStateFromClassification, diffFeatureStates } from '../ai/features';
import type { Hand, Rank, Seat, Suit } from '../core';

type JsonLabels = {
  E: { busy: CardId[]; idle: CardId[] };
  W: { busy: CardId[]; idle: CardId[] };
};

type JsonState = {
  threat: ClassificationState['threat'];
  labels: JsonLabels;
  perCardRole: ClassificationState['perCardRole'];
};

type InitRequest = {
  mode: 'init';
  position: Position;
  threatCardIds: CardId[];
};

type UpdateRequest = {
  mode: 'update';
  position: Position;
  state: JsonState;
  playedCardId: CardId;
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
    for (const suit of suits) out[seat][suit] = [...out[seat][suit]];
  }
  return { hands: out };
}

function handleRequest(req: Request): { ok: true; state: JsonState; features: ReturnType<typeof buildFeatureStateFromClassification>; featureDiff?: ReturnType<typeof diffFeatureStates> } {
  if (req.mode === 'init') {
    const state = initClassification(normalizePosition(req.position), req.threatCardIds);
    const features = buildFeatureStateFromClassification(state);
    return { ok: true, state: toJsonState(state), features };
  }
  const prev = fromJsonState(req.state);
  const next = updateClassificationAfterPlay(prev, normalizePosition(req.position), req.playedCardId);
  const beforeFeatures = buildFeatureStateFromClassification(prev);
  const features = buildFeatureStateFromClassification(next);
  const featureDiff = diffFeatureStates(beforeFeatures, features);
  return { ok: true, state: toJsonState(next), features, featureDiff };
}

async function main(): Promise<void> {
  process.stdin.setEncoding('utf8');
  let buffer = '';
  for await (const chunk of process.stdin) {
    buffer += String(chunk);
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      try {
        const req = JSON.parse(line) as Request;
        process.stdout.write(`${JSON.stringify(handleRequest(req))}\n`);
      } catch (error) {
        process.stdout.write(`${JSON.stringify({ ok: false, error: { message: error instanceof Error ? error.message : String(error) } })}\n`);
      }
    }
  }
}

void main();
