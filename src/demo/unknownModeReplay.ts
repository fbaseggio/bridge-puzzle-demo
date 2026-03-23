import {
  apply,
  InMemorySemanticEventCollector,
  init,
  TeachingReducer,
  type Play,
  type Problem,
  type Rank,
  type Seat,
  type State,
  type Suit
} from '../core';
import type { CardId } from '../ai/threatModel';

// Architecture guard rails:
// - Approved dependency direction for unknown-mode replay is:
//   raw semantic event stream -> per-variant regular semantic replay.
// - Unapproved dependency direction is rebuilding variant replay state inline in main.ts.
// - Unknown-mode display/render code should consume this replay output rather than
//   reconstructing per-variant state ad hoc.

export type UnknownModeTeachingEntry = {
  seq: number;
  seat: string;
  card: string;
  summary: string;
  reasons: string[];
  effects: string[];
  variantGroups?: Array<{
    labels: string[];
    summary: string;
    reasons: string[];
    effects: string[];
  }>;
};

export type UnknownModeVariantReplay = {
  state: State;
  entries: UnknownModeTeachingEntry[];
  ddsSummaries: string[];
};

export type UnknownModePlayedEvent = {
  seat: Seat;
  card: CardId;
  source?: string;
  ddError?: boolean;
  chosenBucket?: string;
  bucketCards?: CardId[];
  policyClassByCard?: Record<string, string>;
  ddPolicy?: {
    mode: 'strict';
    source: 'runtime';
    problemId: string;
    signature: string;
    baseCandidates: CardId[];
    allowedCandidates: CardId[];
    optimalMoves: CardId[];
    bound: boolean;
    fallback: boolean;
    path: 'intersection' | 'dd-fallback' | 'base-fallback';
  };
  legalCount?: number;
};

export type UnknownModeRawSemanticEvent = {
  type: string;
  seat?: Seat;
  card?: CardId;
  details?: Record<string, unknown>;
};

export type UnknownModeReplayProblem = Problem & { threatCardIds?: CardId[] };

export function buildUnknownModePlayedEvents(
  rawEvents: UnknownModeRawSemanticEvent[]
): UnknownModePlayedEvent[] {
  const pendingByCardKey = new Map<string, Omit<UnknownModePlayedEvent, 'seat' | 'card'>>();
  const decisionStartBySeat = new Map<Seat, { legalCount?: number }>();
  const decisionEvalBySeat = new Map<Seat, { chosenBucket?: string; bucketCards?: CardId[]; policyClassByCard?: Record<string, string> }>();
  const playedEvents: UnknownModePlayedEvent[] = [];

  for (const event of rawEvents) {
    if (event.type === 'decision-start' && event.seat) {
      decisionStartBySeat.set(event.seat, { legalCount: typeof event.details?.legalCount === 'number' ? event.details.legalCount : undefined });
      continue;
    }
    if (event.type === 'decision-evaluated' && event.seat) {
      const policyClassByCardRaw = event.details?.policyClassByCard;
      const policyClassByCard =
        policyClassByCardRaw && typeof policyClassByCardRaw === 'object'
          ? Object.fromEntries(
              Object.entries(policyClassByCardRaw as Record<string, unknown>).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string'
              )
            )
          : undefined;
      decisionEvalBySeat.set(event.seat, {
        chosenBucket: typeof event.details?.chosenBucket === 'string' ? event.details.chosenBucket : undefined,
        bucketCards: Array.isArray(event.details?.bucketCards) ? event.details.bucketCards.filter((x): x is CardId => typeof x === 'string') : undefined,
        policyClassByCard
      });
      continue;
    }
    if (event.type === 'decision-chosen' && event.seat && event.card) {
      pendingByCardKey.set(`${event.seat}:${event.card}`, {
        source: typeof event.details?.source === 'string' ? event.details.source : undefined,
        ddError: event.details?.ddError === true,
        chosenBucket: typeof event.details?.chosenBucket === 'string' ? event.details.chosenBucket : decisionEvalBySeat.get(event.seat)?.chosenBucket,
        bucketCards: decisionEvalBySeat.get(event.seat)?.bucketCards,
        policyClassByCard: decisionEvalBySeat.get(event.seat)?.policyClassByCard,
        ddPolicy: event.details?.ddPolicy as UnknownModePlayedEvent['ddPolicy'],
        legalCount: decisionStartBySeat.get(event.seat)?.legalCount
      });
      decisionStartBySeat.delete(event.seat);
      decisionEvalBySeat.delete(event.seat);
      continue;
    }
    if (event.type === 'card-played' && event.seat && event.card) {
      const key = `${event.seat}:${event.card}`;
      const pending = pendingByCardKey.get(key);
      pendingByCardKey.delete(key);
      playedEvents.push({ seat: event.seat, card: event.card, ...pending });
    }
  }

  return playedEvents;
}

export function buildUnknownModeVariantReplayData(
  activeVariantIds: string[],
  playedEvents: UnknownModePlayedEvent[],
  resolveProblem: (variantId: string) => UnknownModeReplayProblem,
  classifyDdErrorForReplay: (
    replayState: State,
    replayProblem: UnknownModeReplayProblem,
    play: Play,
    playedCardIds: string[]
  ) => boolean | undefined
): Map<string, UnknownModeVariantReplay> | null {
  if (activeVariantIds.length <= 1) return null;

  const perVariant = new Map<string, UnknownModeVariantReplay>();
  for (const variantId of activeVariantIds) {
    const replayProblem: UnknownModeReplayProblem = {
      ...resolveProblem(variantId),
      userControls: ['N', 'E', 'S', 'W']
    };
    let replayState = init(replayProblem);
    const ddsSummaries: string[] = [];
    const replayedCardIds: string[] = [];
    const reducer = new TeachingReducer();
    reducer.setTrumpSuit(replayState.trumpSuit);
    const collector = new InMemorySemanticEventCollector();
    collector.attachReducer(reducer);
    let failed = false;

    for (const event of playedEvents) {
      const play = { seat: event.seat, suit: event.card[0] as Suit, rank: event.card.slice(1) as Rank };
      const result = apply(replayState, play, {
        eventCollector: collector,
        userDdError: event.source === 'user'
          ? classifyDdErrorForReplay(replayState, replayProblem, play, replayedCardIds)
          : undefined,
        manualDecision: event.source && event.source !== 'user'
          ? {
              source: event.source,
              chosenBucket: event.chosenBucket,
              bucketCards: event.bucketCards,
              policyClassByCard: event.policyClassByCard,
              ddPolicy: event.ddPolicy,
              legalCount: event.legalCount
            }
          : undefined
      });
      if (result.events.some((e) => e.type === 'illegal')) {
        failed = true;
        break;
      }
      replayedCardIds.push(event.card);
      replayState = result.state;
    }
    if (!failed) {
      perVariant.set(variantId, {
        state: replayState,
        entries: (reducer.snapshot() as { entries: UnknownModeTeachingEntry[] }).entries,
        ddsSummaries
      });
    }
  }

  return perVariant.size > 1 ? perVariant : null;
}
