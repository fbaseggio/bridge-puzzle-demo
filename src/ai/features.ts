import type { CardRole as EngineCardRole, Goal, GoalStatus, Seat, Suit, State } from '../core';
import { computeGoalStatus, remainingTricksFromHands } from '../core';
import type { CardId, ClassificationState, Position, StopStatus, ThreatContext } from './threatModel';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANK_ORDER: string[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

export type FeatureCardRole = EngineCardRole;
export type FeatureColor = 'purple' | 'green' | 'blue' | 'amber' | 'black' | 'grey';

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
  goalStatus: GoalStatus | null;
  threatCardIds: CardId[];
  threatBySuit: Partial<Record<Suit, FeatureSuitState>>;
  cardRoleById: Partial<Record<CardId, FeatureCardRole>>;
  highCardEntries: Record<Seat, Suit[]>;
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
  goalStatusChange?: { before: GoalStatus | null; after: GoalStatus | null };
  highCardEntryChanges?: Array<{ seat: Seat; added: Suit[]; removed: Suit[] }>;
};

function rankStrength(rank: string): number {
  const idx = RANK_ORDER.indexOf(rank);
  return idx < 0 ? -1 : (RANK_ORDER.length - idx);
}

function partnerOf(seat: Seat): Seat {
  if (seat === 'N') return 'S';
  if (seat === 'S') return 'N';
  if (seat === 'E') return 'W';
  return 'E';
}

function computeHighCardEntries(
  hands: State['hands'] | Position['hands'] | undefined,
  cardRoleById: Partial<Record<CardId, FeatureCardRole>>
): Record<Seat, Suit[]> {
  const out: Record<Seat, Suit[]> = { N: [], E: [], S: [], W: [] };
  if (!hands) return out;

  for (const seat of ['N', 'E', 'S', 'W'] as const) {
    const partner = partnerOf(seat);
    const entries: Suit[] = [];
    for (const suit of SUITS) {
      const winnerRanks: string[] = [];
      for (const rank of hands[seat][suit]) {
        const cardId = `${suit}${rank}` as CardId;
        if (cardRoleById[cardId] === 'winner') winnerRanks.push(rank);
      }
      if (winnerRanks.length === 0) continue;
      const partnerRanks = hands[partner][suit];
      if (partnerRanks.length === 0) continue;
      const hasLowerPartnerCard = winnerRanks.some((w) => {
        const wv = rankStrength(w);
        return partnerRanks.some((p) => rankStrength(p) < wv);
      });
      if (hasLowerPartnerCard) entries.push(suit);
    }
    out[seat] = entries;
  }
  return out;
}

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

export function buildFeatureStateFromClassification(state: ClassificationState, position?: Position): FeatureState {
  const cardRoleById = { ...state.perCardRole };
  return {
    goalStatus: null,
    threatCardIds: [...state.threat.threatCardIds],
    threatBySuit: normalizeThreatBySuit(state.threat),
    cardRoleById,
    highCardEntries: computeHighCardEntries(position?.hands, cardRoleById),
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
  goal?: Goal;
  tricksWon?: { NS: number; EW: number };
  hands?: State['hands'];
  goalStatus?: GoalStatus;
}): FeatureState {
  const resolvedGoalStatus =
    input.goalStatus ??
    (input.goal && input.tricksWon && input.hands
      ? computeGoalStatus(input.goal, input.tricksWon, remainingTricksFromHands(input.hands))
      : null);
  const cardRoleById = { ...(input.cardRoles ?? {}) };
  return {
    goalStatus: resolvedGoalStatus,
    threatCardIds: [...(input.threat?.threatCardIds ?? [])],
    threatBySuit: normalizeThreatBySuit(input.threat),
    cardRoleById,
    highCardEntries: computeHighCardEntries(input.hands, cardRoleById),
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

  const goalStatusChange =
    before.goalStatus !== after.goalStatus
      ? { before: before.goalStatus, after: after.goalStatus }
      : undefined;

  const highCardEntryChanges = (['N', 'E', 'S', 'W'] as const)
    .map((seat) => {
      const prev = new Set(before.highCardEntries[seat] ?? []);
      const next = new Set(after.highCardEntries[seat] ?? []);
      const added = SUITS.filter((suit) => !prev.has(suit) && next.has(suit));
      const removed = SUITS.filter((suit) => prev.has(suit) && !next.has(suit));
      return { seat, added, removed };
    })
    .filter((c) => c.added.length > 0 || c.removed.length > 0);

  return {
    removedCards,
    roleChanges,
    suitChanges,
    goalStatusChange,
    highCardEntryChanges: highCardEntryChanges.length > 0 ? highCardEntryChanges : undefined
  };
}

export function getRankColorForFeatureRole(role: FeatureCardRole, teachingMode: boolean): FeatureColor {
  if (!teachingMode) return 'black';
  if (role === 'promotedWinner') return 'purple';
  if (role === 'threat' || role === 'strandedThreat') return 'green';
  if (role === 'resource') return 'amber';
  if (role === 'busy') return 'blue';
  if (role === 'winner' || role === 'idle') return 'black';
  return 'grey';
}
