import { describe, expect, it } from 'vitest';
import {
  resolveWidgetReadingEmbedReservedHeight,
  WIDGET_READING_EMBED_COMPACT_HEIGHT,
  WIDGET_READING_EMBED_FULL_HEIGHT
} from '../../src/demo/widgetReadingEmbedHeight';

describe('widgetReadingEmbedHeight', () => {
  it('returns no reserved height when reading-profile startup is not enabled from URL', () => {
    expect(
      resolveWidgetReadingEmbedReservedHeight({
        readingProfileEnabledFromUrl: false,
        readingRevealEnabled: false,
        readingControlsRevealStage: 'full'
      })
    ).toBeNull();
  });

  it('returns compact height for reading collapsed/quiet controls', () => {
    expect(
      resolveWidgetReadingEmbedReservedHeight({
        readingProfileEnabledFromUrl: true,
        readingRevealEnabled: true,
        readingControlsRevealStage: 'collapsed'
      })
    ).toBe(WIDGET_READING_EMBED_COMPACT_HEIGHT);
    expect(
      resolveWidgetReadingEmbedReservedHeight({
        readingProfileEnabledFromUrl: true,
        readingRevealEnabled: true,
        readingControlsRevealStage: 'quiet'
      })
    ).toBe(WIDGET_READING_EMBED_COMPACT_HEIGHT);
  });

  it('returns full height for any expanded controls outcome', () => {
    expect(
      resolveWidgetReadingEmbedReservedHeight({
        readingProfileEnabledFromUrl: true,
        readingRevealEnabled: true,
        readingControlsRevealStage: 'full'
      })
    ).toBe(WIDGET_READING_EMBED_FULL_HEIGHT);

    // Startup-release puzzle path: profile switches off reading reveal but controls are expanded.
    expect(
      resolveWidgetReadingEmbedReservedHeight({
        readingProfileEnabledFromUrl: true,
        readingRevealEnabled: false,
        readingControlsRevealStage: 'quiet'
      })
    ).toBe(WIDGET_READING_EMBED_FULL_HEIGHT);
  });
});
