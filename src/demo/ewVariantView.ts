import type { CardId, EwVariantState, Hand, Rank, Seat, State, Suit } from '../core';
import { initClassification, parseCardId, type ThreatContext, type ResourceContext } from '../ai/threatModel';
import { buildFeatureStateFromRuntime, getRankColorForFeatureRole, type FeatureColor } from '../ai/features';
import { buildRankColorVisual, buildRegularRankColorClass, type RankColorClass, type RankColorVisual } from './cardDisplay';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

function rankOrderValue(rank: Rank): number {
  return ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'].indexOf(rank);
}

function sortRanksDesc(ranks: Rank[]): Rank[] {
  return [...ranks].sort((a, b) => rankOrderValue(a) - rankOrderValue(b));
}

function activeVariants(state: EwVariantState | null) {
  if (!state) return [];
  return state.variants.filter((variant) => state.activeVariantIds.includes(variant.id));
}

function cloneHand(hand: Hand): Hand {
  return { S: [...hand.S], H: [...hand.H], D: [...hand.D], C: [...hand.C] };
}

function combinedHands(
  state: Pick<State, 'hands'>,
  variant: NonNullable<EwVariantState['variants']>[number]
): Record<Seat, Hand> {
  return {
    N: cloneHand(state.hands.N),
    E: cloneHand(variant.hands.E),
    S: cloneHand(state.hands.S),
    W: cloneHand(variant.hands.W)
  };
}

function cardExistsInHands(hands: Record<Seat, Hand>, cardId: CardId): boolean {
  const { suit, rank } = parseCardId(cardId);
  return (['N', 'E', 'S', 'W'] as const).some((seat) => hands[seat][suit].includes(rank));
}

function classifyWorldForVariant(
  view: Pick<State, 'hands' | 'threat' | 'resource' | 'goalStatus'>,
  hands: Record<Seat, Hand>
): { threat: ThreatContext | null; resource: ResourceContext | null; cardRoles: Partial<Record<CardId, any>>; threatLabels: State['threatLabels'] } {
  const threatCardIds = (view.threat?.threatCardIds ?? []).filter((cardId) => cardExistsInHands(hands, cardId));
  const resourceCardIds = (view.resource?.resourceCardIds ?? []).filter((cardId) => cardExistsInHands(hands, cardId));
  if (threatCardIds.length === 0 && resourceCardIds.length === 0) {
    return { threat: null, resource: null, cardRoles: {}, threatLabels: null };
  }
  const threatSymbolByCardId = Object.fromEntries(
    Object.values(view.threat?.threatsBySuit ?? {})
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .map((entry) => [entry.threatCardId, entry.symbol])
      .filter(([cardId]) => threatCardIds.includes(cardId as CardId))
      .filter(([, symbol]) => typeof symbol === 'string')
  ) as Partial<Record<CardId, string>>;
  const classification = initClassification({ hands }, threatCardIds, resourceCardIds, undefined, threatSymbolByCardId);
  return {
    threat: classification.threat,
    resource: classification.resource,
    cardRoles: classification.perCardRole,
    threatLabels: classification.labels
  };
}

export function fixedRanksForSeatSuit(state: EwVariantState | null, seat: 'E' | 'W', suit: Suit): Rank[] {
  const variants = activeVariants(state);
  if (variants.length === 0) return [];
  const shared = variants.reduce<Rank[]>(
    (common, variant) => common.filter((rank) => variant.hands[seat][suit].includes(rank)),
    [...variants[0].hands[seat][suit]]
  );
  return sortRanksDesc(shared);
}

export function unresolvedEwCardsBySuit(state: EwVariantState | null): Record<Suit, CardId[]> {
  const variants = activeVariants(state);
  const out: Record<Suit, CardId[]> = { S: [], H: [], D: [], C: [] };
  if (variants.length === 0) return out;

  const fixedBySeatSuit: Record<'E' | 'W', Record<Suit, Set<string>>> = {
    E: { S: new Set(fixedRanksForSeatSuit(state, 'E', 'S')), H: new Set(fixedRanksForSeatSuit(state, 'E', 'H')), D: new Set(fixedRanksForSeatSuit(state, 'E', 'D')), C: new Set(fixedRanksForSeatSuit(state, 'E', 'C')) },
    W: { S: new Set(fixedRanksForSeatSuit(state, 'W', 'S')), H: new Set(fixedRanksForSeatSuit(state, 'W', 'H')), D: new Set(fixedRanksForSeatSuit(state, 'W', 'D')), C: new Set(fixedRanksForSeatSuit(state, 'W', 'C')) }
  };

  for (const suit of SUITS) {
    const all = new Set<CardId>();
    for (const variant of variants) {
      for (const seat of ['E', 'W'] as const) {
        for (const rank of variant.hands[seat][suit]) {
          all.add(`${suit}${rank}` as CardId);
        }
      }
    }
    out[suit] = [...all]
      .filter((cardId) => {
        const rank = cardId.slice(1);
        return !fixedBySeatSuit.E[suit].has(rank) && !fixedBySeatSuit.W[suit].has(rank);
      })
      .sort((a, b) => rankOrderValue(a.slice(1) as Rank) - rankOrderValue(b.slice(1) as Rank));
  }
  return out;
}

export function cardVariantColors(
  view: Pick<State, 'hands' | 'ewVariantState' | 'threat' | 'resource' | 'goalStatus'>,
  seat: Seat,
  cardId: CardId,
  teachingMode: boolean
): FeatureColor[] {
  const variants = activeVariants(view.ewVariantState);
  if (variants.length === 0) return ['black'];
  const colors: FeatureColor[] = [];
  for (const variant of variants) {
    const hands = combinedHands(view, variant);
    const world = classifyWorldForVariant(view, hands);
    const features = buildFeatureStateFromRuntime({
      threat: world.threat,
      threatLabels: world.threatLabels,
      cardRoles: world.cardRoles,
      goalStatus: view.goalStatus
    });
    const color = getRankColorForFeatureRole(features.cardRoleById[cardId] ?? 'default', teachingMode);
    if (!colors.includes(color)) colors.push(color);
  }
  return colors.length > 0 ? colors : ['black'];
}

function toRankColorClass(color: FeatureColor): RankColorClass {
  if (color === 'purple') return 'rank--purple';
  if (color === 'green') return 'rank--green';
  if (color === 'blue') return 'rank--blue';
  if (color === 'amber') return 'rank--amber';
  if (color === 'grey') return 'rank--grey';
  return 'rank--black';
}

export function buildUnknownMergedRankColorVisual(
  view: Pick<State, 'hands' | 'ewVariantState' | 'threat' | 'resource' | 'goalStatus'>,
  seat: Seat,
  cardId: CardId,
  teachingMode: boolean,
  coloringEnabled: boolean,
  variantStates?: Array<Pick<State, 'cardRoles' | 'threat' | 'threatLabels' | 'goalStatus'>>
): RankColorVisual {
  if (variantStates && variantStates.length > 0) {
    const colorClasses = variantStates
      .map((variantState) => buildRegularRankColorClass(cardId, variantState, variantState.goalStatus, teachingMode, coloringEnabled))
      .filter((color, index, arr) => arr.indexOf(color) === index);
    return buildRankColorVisual(colorClasses);
  }
  const colors = cardVariantColors(view, seat, cardId, teachingMode);
  return buildRankColorVisual(colors.map(toRankColorClass));
}
