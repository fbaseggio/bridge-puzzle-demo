import type { CardRole as EngineCardRole, Seat, Suit, State } from '../core';
import type { CardId, ClassificationState, StopStatus, ThreatContext } from './threatModel';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANK_ORDER: string[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

export type FeatureCardRole = EngineCardRole;
export type FeatureColor = 'purple' | 'green' | 'blue' | 'black';

export type FeatureSuitState = {
  suit: Suit;
  threatCardId: CardId;
  threatRank: State['hands'][Seat][Suit][number];
  establishedOwner: Seat;
  active: boolean;
  threatLength: number;
  stopStatus: StopStatus | null;
};

export type FeatureState = {
  threatCardIds: CardId[];
  threatBySuit: Partial<Record<Suit, FeatureSuitState>>;
  cardRoleById: Partial<Record<CardId, FeatureCardRole>>;
  labels: {
    E: { busy: CardId[]; idle: CardId[] };
    W: { busy: CardId[]; idle: CardId[] };
  } | null;
};

export type FeatureRoleChange = {
  cardId: CardId;
  from: FeatureCardRole | null;
  to: FeatureCardRole | null;
};

export type FeatureSuitChange = {
  suit: Suit;
  before: FeatureSuitState | null;
  after: FeatureSuitState | null;
};

export type FeatureDiff = {
  removedCards: CardId[];
  roleChanges: FeatureRoleChange[];
  suitChanges: FeatureSuitChange[];
};

function rankIndex(cardId: CardId): number {
  return RANK_ORDER.indexOf(cardId.slice(1));
}

function suitIndex(cardId: CardId): number {
  const suit = cardId[0] as Suit;
  return SUITS.indexOf(suit);
}

function sortCardIds(cards: Iterable<CardId>): CardId[] {
  return [...cards].sort((a, b) => {
    const s = suitIndex(a) - suitIndex(b);
    if (s !== 0) return s;
    return rankIndex(a) - rankIndex(b);
  });
}

function normalizeThreatBySuit(ctx: ThreatContext | null | undefined): FeatureState['threatBySuit'] {
  if (!ctx) return {};
  const out: FeatureState['threatBySuit'] = {};
  for (const suit of SUITS) {
    const t = ctx.threatsBySuit[suit];
    if (!t) continue;
    out[suit] = {
      suit: t.suit,
      threatCardId: t.threatCardId,
      threatRank: t.threatRank,
      establishedOwner: t.establishedOwner,
      active: t.active,
      threatLength: t.threatLength,
      stopStatus: t.stopStatus ?? null
    };
  }
  return out;
}

export function buildFeatureStateFromClassification(state: ClassificationState): FeatureState {
  return {
    threatCardIds: [...state.threat.threatCardIds],
    threatBySuit: normalizeThreatBySuit(state.threat),
    cardRoleById: { ...state.perCardRole },
    labels: {
      E: { busy: sortCardIds(state.labels.E.busy), idle: sortCardIds(state.labels.E.idle) },
      W: { busy: sortCardIds(state.labels.W.busy), idle: sortCardIds(state.labels.W.idle) }
    }
  };
}

export function buildFeatureStateFromRuntime(input: {
  threat: ThreatContext | null;
  threatLabels: State['threatLabels'];
  cardRoles: State['cardRoles'];
}): FeatureState {
  return {
    threatCardIds: [...(input.threat?.threatCardIds ?? [])],
    threatBySuit: normalizeThreatBySuit(input.threat),
    cardRoleById: { ...(input.cardRoles ?? {}) },
    labels: input.threatLabels
      ? {
          E: { busy: sortCardIds(input.threatLabels.E.busy), idle: sortCardIds(input.threatLabels.E.idle) },
          W: { busy: sortCardIds(input.threatLabels.W.busy), idle: sortCardIds(input.threatLabels.W.idle) }
        }
      : null
  };
}

function sameSuitState(a: FeatureSuitState | null | undefined, b: FeatureSuitState | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.suit === b.suit &&
    a.threatCardId === b.threatCardId &&
    a.threatRank === b.threatRank &&
    a.establishedOwner === b.establishedOwner &&
    a.active === b.active &&
    a.threatLength === b.threatLength &&
    a.stopStatus === b.stopStatus
  );
}

export function diffFeatureStates(before: FeatureState, after: FeatureState): FeatureDiff {
  const allCards = new Set<CardId>([
    ...(Object.keys(before.cardRoleById) as CardId[]),
    ...(Object.keys(after.cardRoleById) as CardId[])
  ]);
  const roleChanges: FeatureRoleChange[] = [];
  const removedCards: CardId[] = [];
  for (const cardId of sortCardIds(allCards)) {
    const from = before.cardRoleById[cardId] ?? null;
    const to = after.cardRoleById[cardId] ?? null;
    if (from === to) continue;
    roleChanges.push({ cardId, from, to });
    if (from && !to) removedCards.push(cardId);
  }

  const suitChanges: FeatureSuitChange[] = [];
  for (const suit of SUITS) {
    const prev = before.threatBySuit[suit] ?? null;
    const next = after.threatBySuit[suit] ?? null;
    if (!sameSuitState(prev, next)) {
      suitChanges.push({ suit, before: prev, after: next });
    }
  }

  return { removedCards, roleChanges, suitChanges };
}

export function getRankColorForFeatureRole(role: FeatureCardRole, teachingMode: boolean): FeatureColor {
  if (!teachingMode) return 'black';
  if (role === 'promotedWinner') return 'purple';
  if (role === 'threat') return 'green';
  if (role === 'busy') return 'blue';
  return 'black';
}

