import type { CardId, Rank, Seat, State, Suit } from './types';

const RANK_ORDER: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SEATS: Seat[] = ['N', 'E', 'S', 'W'];

function rankIndex(rank: Rank): number {
  return RANK_ORDER.indexOf(rank);
}

function cardId(suit: Suit, rank: Rank): CardId {
  return `${suit}${rank}`;
}

function intermediateRanks(high: Rank, low: Rank): Rank[] {
  const hi = rankIndex(high);
  const lo = rankIndex(low);
  if (hi < 0 || lo < 0 || lo - hi <= 1) return [];
  return RANK_ORDER.slice(hi + 1, lo);
}

function isGapAbsentFromOthers(state: State, seat: Seat, suit: Suit, high: Rank, low: Rank): boolean {
  const mids = intermediateRanks(high, low);
  if (mids.length === 0) return true;
  const others = SEATS.filter((s) => s !== seat);
  return mids.every((r) => others.every((s) => !state.hands[s][suit].includes(r)));
}

function areConsecutive(a: Rank, b: Rank): boolean {
  return Math.abs(rankIndex(a) - rankIndex(b)) === 1;
}

export function getSuitEquivalenceClasses(state: State, seat: Seat, suit: Suit): Rank[][] {
  const held = [...state.hands[seat][suit]].sort((a, b) => rankIndex(a) - rankIndex(b));
  if (held.length === 0) return [];
  const classes: Rank[][] = [[held[0]]];

  for (let i = 1; i < held.length; i += 1) {
    const prev = held[i - 1];
    const curr = held[i];
    const connect = areConsecutive(prev, curr) || isGapAbsentFromOthers(state, seat, suit, prev, curr);
    if (connect) {
      classes[classes.length - 1].push(curr);
    } else {
      classes.push([curr]);
    }
  }

  return classes;
}

export function classIdForMembers(seat: Seat, suit: Suit, members: Rank[]): string {
  const sorted = [...members].sort((a, b) => rankIndex(a) - rankIndex(b));
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  return `${seat}:${suit}:${top}-${bottom}`;
}

export function representativeForMembers(suit: Suit, members: Rank[]): CardId {
  const sorted = [...members].sort((a, b) => rankIndex(a) - rankIndex(b));
  const lowest = sorted[sorted.length - 1];
  return cardId(suit, lowest);
}

export function classInfoForCard(state: State, seat: Seat, card: CardId): { classId: string; representative: CardId; members: CardId[] } {
  const suit = card[0] as Suit;
  const rank = card.slice(1) as Rank;
  const classes = getSuitEquivalenceClasses(state, seat, suit);
  const members = classes.find((c) => c.includes(rank)) ?? [rank];
  return {
    classId: classIdForMembers(seat, suit, members),
    representative: representativeForMembers(suit, members),
    members: members.map((r) => cardId(suit, r))
  };
}
