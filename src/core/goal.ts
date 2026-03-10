import type { Goal, GoalStatus, Hand, Seat, Suit } from './types';

const SEATS: Seat[] = ['N', 'E', 'S', 'W'];
const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

export function remainingTricksFromHands(hands: Record<Seat, Hand>): number {
  let cards = 0;
  for (const seat of SEATS) {
    for (const suit of SUITS) {
      cards += hands[seat][suit].length;
    }
  }
  return Math.floor(cards / 4);
}

export function computeGoalStatus(
  goal: Goal,
  tricksWon: { NS: number; EW: number },
  remainingTricks: number
): GoalStatus {
  if (goal.type === 'minTricks') {
    const won = tricksWon[goal.side];
    if (won >= goal.n) return 'assuredSuccess';
    if (won + remainingTricks < goal.n) return 'assuredFailure';
    return 'live';
  }
  return 'live';
}

