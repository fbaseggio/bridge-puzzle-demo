import type { ReadingControlsRevealStage } from './handDiagramSession';

export const WIDGET_READING_EMBED_COMPACT_HEIGHT = 326;
export const WIDGET_READING_EMBED_FULL_HEIGHT = 364;

export type ResolveWidgetReadingEmbedReservedHeightInput = {
  readingProfileEnabledFromUrl: boolean;
  readingRevealEnabled: boolean;
  readingControlsRevealStage: ReadingControlsRevealStage;
};

// Height reservation follows effective controls shape, not the triggering action path.
export function resolveWidgetReadingEmbedReservedHeight(
  input: ResolveWidgetReadingEmbedReservedHeightInput
): number | null {
  if (!input.readingProfileEnabledFromUrl) return null;
  const expandedControls = (
    !input.readingRevealEnabled
    || input.readingControlsRevealStage === 'full'
  );
  return expandedControls
    ? WIDGET_READING_EMBED_FULL_HEIGHT
    : WIDGET_READING_EMBED_COMPACT_HEIGHT;
}
