import type { Goal, GoalStatus, Hand, Play, Rank, Seat, Side, Suit } from '../core';

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
  stranded?: boolean;
  threatLength: number;
  stopStatus?: StopStatus;
};

export type ThreatContext = {
  threatsBySuit: Partial<Record<Suit, ThreatSuitState>>;
  threatCardIds: CardId[];
};

export type DefenderLabels = Record<DefenderSeat, { busy: Set<CardId>; idle: Set<CardId> }>;
export type CardRole = 'promotedWinner' | 'threat' | 'strandedThreat' | 'busy' | 'idle' | 'winner' | 'default';
export type ClassificationState = {
  threat: ThreatContext;
  labels: DefenderLabels;
  perCardRole: Partial<Record<CardId, CardRole>>;
};

export type RuntimeThreatContext = {
  trick?: Play[];
  trumpSuit?: Suit | null;
  goal?: Goal;
  tricksWon?: { NS: number; EW: number };
  goalStatus?: GoalStatus | null;
};

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const SEATS: Seat[] = ['N', 'E', 'S', 'W'];
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
  for (const seat of SEATS) {
    if (position.hands[seat][suit].includes(rank)) owners.push(seat);
  }
  return owners;
}

function seatSide(seat: Seat): Side {
  return seat === 'N' || seat === 'S' ? 'NS' : 'EW';
}

function nextSeat(seat: Seat): Seat {
  const idx = SEATS.indexOf(seat);
  return SEATS[(idx + 1) % SEATS.length];
}

function remainingTricksNow(position: Position, trick: Play[] | undefined): number {
  let cards = 0;
  for (const seat of SEATS) {
    for (const suit of SUITS) cards += position.hands[seat][suit].length;
  }
  const inTrick = trick?.length ?? 0;
  return Math.floor((cards + inTrick) / 4);
}

function rankWinnerOfTrick(trick: Play[], trumpSuit: Suit | null): Seat {
  const leadSuit = trick[0].suit;
  const trumps = trumpSuit ? trick.filter((p) => p.suit === trumpSuit) : [];
  const candidates = trumps.length > 0 ? trumps : trick.filter((p) => p.suit === leadSuit);
  let winner = candidates[0];
  for (const play of candidates.slice(1)) {
    if (rankValue(play.rank) > rankValue(winner.rank)) winner = play;
  }
  return winner.seat;
}

function legalPlaysForSeatInTrick(position: Position, seat: Seat, trick: Play[]): Play[] {
  const hand = position.hands[seat];
  const leadSuit = trick[0]?.suit ?? null;
  if (leadSuit && hand[leadSuit].length > 0) {
    return hand[leadSuit].map((rank) => ({ seat, suit: leadSuit, rank }));
  }
  const plays: Play[] = [];
  for (const suit of SUITS) {
    for (const rank of hand[suit]) plays.push({ seat, suit, rank });
  }
  return plays;
}

function clonePosition(position: Position): Position {
  return {
    hands: {
      N: { S: [...position.hands.N.S], H: [...position.hands.N.H], D: [...position.hands.N.D], C: [...position.hands.N.C] },
      E: { S: [...position.hands.E.S], H: [...position.hands.E.H], D: [...position.hands.E.D], C: [...position.hands.E.C] },
      S: { S: [...position.hands.S.S], H: [...position.hands.S.H], D: [...position.hands.S.D], C: [...position.hands.S.C] },
      W: { S: [...position.hands.W.S], H: [...position.hands.W.H], D: [...position.hands.W.D], C: [...position.hands.W.C] }
    }
  };
}

function forcedNextTrickLeader(
  position: Position,
  trick: Play[] | undefined,
  trumpSuit: Suit | null
): Seat | null {
  const current = trick ?? [];
  if (current.length === 0 || current.length >= 4) return null;
  const toPlay: Seat[] = [];
  let seat = nextSeat(current[current.length - 1].seat);
  for (let i = current.length; i < 4; i += 1) {
    toPlay.push(seat);
    seat = nextSeat(seat);
  }

  const winners = new Set<Seat>();
  const recurse = (idx: number, pos: Position, soFar: Play[]): void => {
    if (winners.size > 1) return;
    if (idx >= toPlay.length) {
      winners.add(rankWinnerOfTrick(soFar, trumpSuit));
      return;
    }
    const s = toPlay[idx];
    const legal = legalPlaysForSeatInTrick(pos, s, soFar);
    for (const play of legal) {
      const nextPos = clonePosition(pos);
      const hand = nextPos.hands[s][play.suit];
      const i = hand.indexOf(play.rank);
      if (i >= 0) hand.splice(i, 1);
      recurse(idx + 1, nextPos, [...soFar, play]);
      if (winners.size > 1) return;
    }
  };

  recurse(0, clonePosition(position), current.map((p) => ({ ...p })));
  return winners.size === 1 ? [...winners][0] : null;
}

function hasHighCardEntry(position: Position, seat: Seat): boolean {
  const partner = partnerOf(seat);
  const opponents: Seat[] = seat === 'N' || seat === 'S' ? ['E', 'W'] : ['N', 'S'];
  for (const suit of SUITS) {
    const own = position.hands[seat][suit];
    const partnerHold = position.hands[partner][suit];
    if (own.length === 0 || partnerHold.length === 0) continue;
    let highestOpponent = 0;
    for (const opp of opponents) {
      for (const r of position.hands[opp][suit]) highestOpponent = Math.max(highestOpponent, rankValue(r));
    }
    const winnerRanks = own.filter((r) => rankValue(r) > highestOpponent);
    if (winnerRanks.length === 0) continue;
    for (const wr of winnerRanks) {
      const wv = rankValue(wr);
      if (partnerHold.some((pr) => rankValue(pr) < wv)) return true;
    }
  }
  return false;
}

function shouldStrandThreat(
  threat: ThreatSuitState,
  position: Position,
  runtime?: RuntimeThreatContext
): boolean {
  if (!threat.active) return false;
  const goal = runtime?.goal;
  const tricksWon = runtime?.tricksWon;
  if (!goal || !tricksWon || goal.type !== 'minTricks') return false;
  const ownerSide = seatSide(threat.establishedOwner);
  if (ownerSide !== goal.side) return false;
  const remain = remainingTricksNow(position, runtime?.trick);
  const needed = goal.n - tricksWon[goal.side];
  if (needed !== remain) return false;
  if (hasHighCardEntry(position, threat.establishedOwner)) return false;
  const forcedLeader = forcedNextTrickLeader(position, runtime?.trick, runtime?.trumpSuit ?? null);
  return !!forcedLeader && forcedLeader !== threat.establishedOwner;
}

function applyStrandedFlags(ctx: ThreatContext, position: Position, runtime?: RuntimeThreatContext): ThreatContext {
  const next: ThreatContext = { threatCardIds: [...ctx.threatCardIds], threatsBySuit: { ...ctx.threatsBySuit } };
  for (const suit of SUITS) {
    const t = next.threatsBySuit[suit];
    if (!t) continue;
    next.threatsBySuit[suit] = { ...t, stranded: shouldStrandThreat(t, position, runtime) };
  }
  return next;
}

function partnerOf(seat: Seat): Seat {
  if (seat === 'N') return 'S';
  if (seat === 'S') return 'N';
  if (seat === 'E') return 'W';
  return 'E';
}

function defendersOf(owner: Seat): Seat[] {
  return owner === 'N' || owner === 'S' ? ['E', 'W'] : ['N', 'S'];
}

function countThreatLength(position: Position, owner: Seat, suit: Suit, threatRank: Rank): number {
  const ownerSuitRanks = position.hands[owner][suit];
  const threatValue = rankValue(threatRank);

  const base = ownerSuitRanks.filter((r) => rankValue(r) >= threatValue).length;
  const lowOwner = ownerSuitRanks.filter((r) => rankValue(r) < threatValue).length;

  const defenders = defendersOf(owner);
  let highestOpponentValue = 0;
  for (const defender of defenders) {
    for (const rank of position.hands[defender][suit]) {
      highestOpponentValue = Math.max(highestOpponentValue, rankValue(rank));
    }
  }

  const partner = partnerOf(owner);
  const partnerWinners = position.hands[partner][suit].filter((r) => rankValue(r) > highestOpponentValue).length;

  return base + Math.min(lowOwner, partnerWinners);
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
      if (!threat || !threat.active || threat.stranded || threat.threatLength <= 0) continue;

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
  if (!threat || !threat.active || threat.stranded) return undefined;
  const busyE = busyInSuit(labels, 'E', suit);
  const busyW = busyInSuit(labels, 'W', suit);
  if (busyE && busyW) return 'double';
  if (busyE || busyW) return 'single';
  return 'none';
}

function isPromotedWinnerSuit(ctx: ThreatContext, labels: DefenderLabels, suit: Suit): boolean {
  const threat = ctx.threatsBySuit[suit];
  if (!threat || !threat.active || threat.stranded) return false;
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
    if (!threat || !threat.active || threat.stranded || threat.threatLength <= 0) continue;
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

  // Mark generic suit winners first; later role passes (idle/busy/threat/promotedWinner)
  // retain precedence and can overwrite this role.
  for (const seat of seats) {
    const opponents: Seat[] = seat === 'N' || seat === 'S' ? ['E', 'W'] : ['N', 'S'];
    let highestOpponent = 0;
    for (const opp of opponents) {
      for (const oppRank of position.hands[opp][suit]) {
        highestOpponent = Math.max(highestOpponent, rankValue(oppRank));
      }
    }
    for (const rank of position.hands[seat][suit]) {
      if (rankValue(rank) > highestOpponent) {
        perCardRole[toCardId(suit, rank)] = 'winner';
      }
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
    perCardRole[threat.threatCardId] = threat.stranded ? 'strandedThreat' : 'threat';
    if (!threat.stranded && isPromotedWinnerSuit(ctx, labels, suit)) {
      perCardRole[threat.threatCardId] = 'promotedWinner';
    }
  }
}

export function initClassification(position: Position, threatCardIds: CardId[], runtime?: RuntimeThreatContext): ClassificationState {
  const threat = applyStrandedFlags(initThreatContext(position, threatCardIds), position, runtime);
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
  playedCardId: CardId,
  runtime?: RuntimeThreatContext
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

  const strandedThreat = applyStrandedFlags(nextThreat, position, runtime);
  const recomputedLabels = computeDefenderLabels(strandedThreat, position);
  for (const suit of SUITS) {
    const updatedThreat = strandedThreat.threatsBySuit[suit];
    if (updatedThreat) {
      strandedThreat.threatsBySuit[suit] = {
        ...updatedThreat,
        stopStatus: computeStopStatus(strandedThreat, recomputedLabels, suit)
      };
    }
    updateRolesForSuit(nextRoles, strandedThreat, recomputedLabels, position, suit);
  }

  return {
    threat: strandedThreat,
    labels: recomputedLabels,
    perCardRole: nextRoles
  };
}
