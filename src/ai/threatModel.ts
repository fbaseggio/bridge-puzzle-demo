import type { Hand, Rank, Seat, Suit } from '../core';

export type CardId = `${Suit}${Rank}`;
export type Position = { hands: Record<Seat, Hand> };
export type DefenderSeat = 'E' | 'W';
export type StopStatus = 'none' | 'single' | 'double';

type ThreatSuitState = {
  suit: Suit;
  threatCardId: CardId;
  threatRank: Rank;
  establishedOwner: Seat;
  active: boolean;
  threatLength: number;
  stopStatus?: StopStatus;
};

export type ThreatContext = {
  threatsBySuit: Partial<Record<Suit, ThreatSuitState>>;
  threatCardIds: CardId[];
};

export type DefenderLabels = Record<DefenderSeat, { busy: Set<CardId>; idle: Set<CardId> }>;
export type CardRole = 'promotedWinner' | 'threat' | 'busy' | 'idle' | 'default';
export type ClassificationState = {
  threat: ThreatContext;
  labels: DefenderLabels;
  perCardRole: Partial<Record<CardId, CardRole>>;
};

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const DEFENDERS: DefenderSeat[] = ['E', 'W'];
const RANK_VALUE: Record<Rank, number> = {
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

export function parseCardId(cardId: string): { suit: Suit; rank: Rank } {
  const suit = cardId.slice(0, 1) as Suit;
  const rank = cardId.slice(1) as Rank;
  if (!SUITS.includes(suit) || !(rank in RANK_VALUE)) {
    throw new Error(`Invalid CardId: ${cardId}`);
  }
  return { suit, rank };
}

export function toCardId(suit: Suit, rank: Rank): CardId {
  return `${suit}${rank}`;
}

function rankValue(rank: Rank): number {
  return RANK_VALUE[rank];
}

function ownersOfCard(position: Position, cardId: CardId): Seat[] {
  const { suit, rank } = parseCardId(cardId);
  const owners: Seat[] = [];
  const seats: Seat[] = ['N', 'E', 'S', 'W'];
  for (const seat of seats) {
    if (position.hands[seat][suit].includes(rank)) owners.push(seat);
  }
  return owners;
}

function countThreatLength(position: Position, owner: Seat, suit: Suit, threatRank: Rank): number {
  return position.hands[owner][suit].filter((r) => rankValue(r) >= rankValue(threatRank)).length;
}

export function initThreatContext(position: Position, threatCardIds: CardId[]): ThreatContext {
  const bySuit: Partial<Record<Suit, ThreatSuitState>> = {};

  for (const cardId of threatCardIds) {
    const { suit, rank } = parseCardId(cardId);
    if (bySuit[suit]) {
      throw new Error(`Duplicate threat suit: ${suit}`);
    }

    const owners = ownersOfCard(position, cardId);
    if (owners.length !== 1) {
      throw new Error(`Threat card ${cardId} must exist in exactly one hand (found ${owners.length})`);
    }

    const establishedOwner = owners[0];
    bySuit[suit] = {
      suit,
      threatCardId: cardId,
      threatRank: rank,
      establishedOwner,
      active: true,
      threatLength: countThreatLength(position, establishedOwner, suit, rank)
    };
  }

  return { threatsBySuit: bySuit, threatCardIds: [...threatCardIds] };
}

export function updateThreatContextAfterTrick(
  ctx: ThreatContext,
  position: Position,
  trickCardsPlayed: CardId[]
): ThreatContext {
  const next: ThreatContext = {
    threatsBySuit: { ...ctx.threatsBySuit },
    threatCardIds: [...ctx.threatCardIds]
  };

  const touchedSuits = new Set<Suit>(trickCardsPlayed.map((c) => parseCardId(c).suit));

  for (const suit of touchedSuits) {
    const threat = next.threatsBySuit[suit];
    if (!threat) continue;

    const owners = ownersOfCard(position, threat.threatCardId);
    const stillEstablished = owners.length === 1 && owners[0] === threat.establishedOwner;

    next.threatsBySuit[suit] = {
      ...threat,
      active: stillEstablished,
      threatLength: stillEstablished
        ? countThreatLength(position, threat.establishedOwner, suit, threat.threatRank)
        : 0
    };
  }

  return next;
}

export function computeDefenderLabels(ctx: ThreatContext, position: Position): DefenderLabels {
  const labels: DefenderLabels = {
    E: { busy: new Set<CardId>(), idle: new Set<CardId>() },
    W: { busy: new Set<CardId>(), idle: new Set<CardId>() }
  };

  for (const defender of DEFENDERS) {
    for (const suit of SUITS) {
      for (const rank of position.hands[defender][suit]) {
        labels[defender].idle.add(toCardId(suit, rank));
      }

      const threat = ctx.threatsBySuit[suit];
      if (!threat || !threat.active || threat.threatLength <= 0) continue;

      const suitRanks = position.hands[defender][suit];
      const hasHigher = suitRanks.some((r) => rankValue(r) > rankValue(threat.threatRank));
      const longEnough = suitRanks.length >= threat.threatLength;
      if (!hasHigher || !longEnough) continue;

      const busyRanks = [...suitRanks]
        .sort((a, b) => rankValue(b) - rankValue(a))
        .slice(0, threat.threatLength);

      for (const rank of busyRanks) {
        const id = toCardId(suit, rank);
        labels[defender].idle.delete(id);
        labels[defender].busy.add(id);
      }
    }
  }

  return labels;
}

function cloneLabels(labels: DefenderLabels): DefenderLabels {
  return {
    E: { busy: new Set(labels.E.busy), idle: new Set(labels.E.idle) },
    W: { busy: new Set(labels.W.busy), idle: new Set(labels.W.idle) }
  };
}

function busyInSuit(labels: DefenderLabels, defender: DefenderSeat, suit: Suit): boolean {
  return [...labels[defender].busy].some((id) => parseCardId(id).suit === suit);
}

function computeStopStatus(ctx: ThreatContext, labels: DefenderLabels, suit: Suit): StopStatus | undefined {
  const threat = ctx.threatsBySuit[suit];
  if (!threat || !threat.active) return undefined;
  const busyE = busyInSuit(labels, 'E', suit);
  const busyW = busyInSuit(labels, 'W', suit);
  if (busyE && busyW) return 'double';
  if (busyE || busyW) return 'single';
  return 'none';
}

function isPromotedWinnerSuit(ctx: ThreatContext, labels: DefenderLabels, suit: Suit): boolean {
  const threat = ctx.threatsBySuit[suit];
  if (!threat || !threat.active) return false;
  return (threat.stopStatus ?? computeStopStatus(ctx, labels, suit)) === 'none';
}

export function getPromotedWinnerRankForSuit(
  ctx: ThreatContext,
  labels: DefenderLabels,
  suit: Suit
): Rank | null {
  if (!isPromotedWinnerSuit(ctx, labels, suit)) return null;
  return ctx.threatsBySuit[suit]?.threatRank ?? null;
}

function recomputeSuitLabels(ctx: ThreatContext, position: Position, labels: DefenderLabels, suit: Suit): void {
  for (const defender of DEFENDERS) {
    for (const id of [...labels[defender].busy]) {
      if (parseCardId(id).suit === suit) labels[defender].busy.delete(id);
    }
    for (const id of [...labels[defender].idle]) {
      if (parseCardId(id).suit === suit) labels[defender].idle.delete(id);
    }

    for (const rank of position.hands[defender][suit]) {
      labels[defender].idle.add(toCardId(suit, rank));
    }

    const threat = ctx.threatsBySuit[suit];
    if (!threat || !threat.active || threat.threatLength <= 0) continue;
    const suitRanks = position.hands[defender][suit];
    const hasHigher = suitRanks.some((r) => rankValue(r) > rankValue(threat.threatRank));
    const longEnough = suitRanks.length >= threat.threatLength;
    if (!hasHigher || !longEnough) continue;
    const busyRanks = [...suitRanks]
      .sort((a, b) => rankValue(b) - rankValue(a))
      .slice(0, threat.threatLength);
    for (const rank of busyRanks) {
      const id = toCardId(suit, rank);
      labels[defender].idle.delete(id);
      labels[defender].busy.add(id);
    }
  }
}

function updateRolesForSuit(
  perCardRole: Partial<Record<CardId, CardRole>>,
  ctx: ThreatContext,
  labels: DefenderLabels,
  position: Position,
  suit: Suit
): void {
  for (const key of Object.keys(perCardRole) as CardId[]) {
    if (parseCardId(key).suit === suit) delete perCardRole[key];
  }

  const seats: Seat[] = ['N', 'E', 'S', 'W'];
  for (const seat of seats) {
    for (const rank of position.hands[seat][suit]) {
      const cardId = toCardId(suit, rank);
      perCardRole[cardId] = 'default';
    }
  }

  for (const defender of DEFENDERS) {
    for (const id of labels[defender].idle) {
      if (parseCardId(id).suit === suit) perCardRole[id] = 'idle';
    }
    for (const id of labels[defender].busy) {
      if (parseCardId(id).suit === suit) perCardRole[id] = 'busy';
    }
  }

  const threat = ctx.threatsBySuit[suit];
  if (threat?.active) {
    perCardRole[threat.threatCardId] = 'threat';
    if (isPromotedWinnerSuit(ctx, labels, suit)) {
      perCardRole[threat.threatCardId] = 'promotedWinner';
    }
  }
}

export function initClassification(position: Position, threatCardIds: CardId[]): ClassificationState {
  const threat = initThreatContext(position, threatCardIds);
  const labels = computeDefenderLabels(threat, position);
  for (const suit of SUITS) {
    const entry = threat.threatsBySuit[suit];
    if (!entry) continue;
    threat.threatsBySuit[suit] = {
      ...entry,
      stopStatus: computeStopStatus(threat, labels, suit)
    };
  }
  const perCardRole: Partial<Record<CardId, CardRole>> = {};
  for (const suit of SUITS) {
    updateRolesForSuit(perCardRole, threat, labels, position, suit);
  }
  return { threat, labels, perCardRole };
}

export function updateClassificationAfterPlay(
  state: ClassificationState,
  position: Position,
  playedCardId: CardId
): ClassificationState {
  const nextThreat: ThreatContext = {
    threatCardIds: [...state.threat.threatCardIds],
    threatsBySuit: { ...state.threat.threatsBySuit }
  };
  const nextLabels = cloneLabels(state.labels);
  const nextRoles: Partial<Record<CardId, CardRole>> = { ...state.perCardRole };
  delete nextRoles[playedCardId];

  const playedSuit = parseCardId(playedCardId).suit;
  const dirtySuits = new Set<Suit>();
  if (nextThreat.threatsBySuit[playedSuit]) dirtySuits.add(playedSuit);

  for (const suit of dirtySuits) {
    const threat = nextThreat.threatsBySuit[suit];
    if (!threat) continue;
    const owners = ownersOfCard(position, threat.threatCardId);
    const stillEstablished = owners.length === 1 && owners[0] === threat.establishedOwner;
    nextThreat.threatsBySuit[suit] = {
      ...threat,
      active: stillEstablished,
      threatLength: stillEstablished
        ? countThreatLength(position, threat.establishedOwner, suit, threat.threatRank)
        : 0,
      stopStatus: undefined
    };
    recomputeSuitLabels(nextThreat, position, nextLabels, suit);
    const updatedThreat = nextThreat.threatsBySuit[suit];
    if (updatedThreat) {
      nextThreat.threatsBySuit[suit] = {
        ...updatedThreat,
        stopStatus: computeStopStatus(nextThreat, nextLabels, suit)
      };
    }
    updateRolesForSuit(nextRoles, nextThreat, nextLabels, position, suit);
  }

  return {
    threat: nextThreat,
    labels: nextLabels,
    perCardRole: nextRoles
  };
}
