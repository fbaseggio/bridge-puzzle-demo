import { getSuitEquivalenceClasses, type Play, type Rank, type Seat, type State, type Suit } from '../core';
import { toCardId, type CardId } from '../ai/threatModel';
import { buildRegularCardDisplayProjection, type RankColorVisual } from './cardDisplay';

// Architecture guard rails:
// - Approved dependency direction for regular display is semantic state -> regular display view.
// - Unapproved dependency direction is render code deriving card visuals/equivalence directly
//   from raw runtime state when a shared regular display view can provide it.
// - Unknown mode may merge regular display views, but should not bypass them for regular cases.

const RANK_ORDER: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

export type RegularSuitCardDisplay = {
  cardId: CardId;
  rank: Rank;
  isEquivalent: boolean;
  visual: RankColorVisual;
};

export type RegularPlayedCardDisplay = {
  cardId: CardId;
  rank: Rank;
  visual: RankColorVisual;
};

function sortRanksDesc(ranks: Rank[]): Rank[] {
  return [...ranks].sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b));
}

export function buildRegularSuitCardDisplays(
  view: State,
  seat: Seat,
  suit: Suit,
  teachingMode: boolean,
  coloringEnabled: boolean,
  showEquivalentUnderlines: boolean
): RegularSuitCardDisplay[] {
  const equivalentRanks = new Set<Rank>();
  if (showEquivalentUnderlines) {
    for (const cls of getSuitEquivalenceClasses(view, seat, suit)) {
      if (cls.length > 1) {
        for (const rank of cls) equivalentRanks.add(rank);
      }
    }
  }
  return sortRanksDesc(view.hands[seat][suit]).map((rank) => {
    const cardId = toCardId(suit, rank) as CardId;
    const projection = buildRegularCardDisplayProjection(
      cardId,
      view,
      view.goalStatus,
      teachingMode,
      coloringEnabled
    );
    return {
      cardId,
      rank,
      isEquivalent: equivalentRanks.has(rank),
      visual: projection.visual
    };
  });
}

export function buildRegularPlayedCardDisplay(
  view: State,
  play: Play,
  teachingMode: boolean,
  coloringEnabled: boolean
): RegularPlayedCardDisplay {
  const cardId = toCardId(play.suit, play.rank) as CardId;
  return {
    cardId,
    rank: play.rank,
    visual: buildRegularCardDisplayProjection(
      cardId,
      view,
      view.goalStatus,
      teachingMode,
      coloringEnabled
    ).visual
  };
}
