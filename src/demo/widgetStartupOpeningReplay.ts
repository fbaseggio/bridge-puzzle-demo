import type { CardId } from '../core';
import type { WidgetJourneyProfile } from './widgetJourneyState';

export type WidgetNonScriptForwardMode =
  | { kind: 'scripted-opening'; cardId: CardId }
  | { kind: 'pause-user-turn' }
  | { kind: 'advance-live-play' };

export function resolveWidgetNonScriptForwardPauseMessage(seatName: string): string {
  return `Select ${seatName}'s next play to continue.`;
}

export function resolveScriptedOpeningReplayCard(
  scriptedOpening: CardId[],
  playedCardIds: readonly string[]
): CardId | null {
  if (scriptedOpening.length === 0) return null;
  if (playedCardIds.length >= scriptedOpening.length) return null;
  for (let i = 0; i < playedCardIds.length; i += 1) {
    if (scriptedOpening[i] !== playedCardIds[i]) return null;
  }
  return scriptedOpening[playedCardIds.length] ?? null;
}

export function resolveWidgetNonScriptForwardMode(input: {
  scriptedOpening: CardId[];
  playedCardIds: readonly string[];
  userTurn: boolean;
  activeInteractionProfile: WidgetJourneyProfile | null;
}): WidgetNonScriptForwardMode {
  const scriptedCardId = resolveScriptedOpeningReplayCard(input.scriptedOpening, input.playedCardIds);
  if (scriptedCardId) return { kind: 'scripted-opening', cardId: scriptedCardId };
  if (input.userTurn && input.activeInteractionProfile === 'puzzle-solving') {
    return { kind: 'pause-user-turn' };
  }
  return { kind: 'advance-live-play' };
}
