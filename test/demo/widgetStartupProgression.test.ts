import { describe, expect, it } from 'vitest';
import type { CardId } from '../../src/core';
import { experimentalDraftIntroScript, resolveArticleScriptCardAtCursor } from '../../src/demo/articleScripts';
import { advanceWidgetStartupFromScript } from '../../src/demo/widgetStartupProgression';

function makeScriptAdvanceHarness() {
  let cursor = 0;
  const history: CardId[] = [];
  const advanceOneWidgetCard = (): boolean => {
    const nextCardId = resolveArticleScriptCardAtCursor(experimentalDraftIntroScript, cursor);
    if (!nextCardId) return false;
    history.push(nextCardId);
    cursor += 1;
    return true;
  };
  return {
    history,
    getCursor: () => cursor,
    advanceOneWidgetCard
  };
}

describe('widgetStartupProgression', () => {
  it('keeps story startup progression on article-script history so early pause advances stay on authored prefix', () => {
    const harness = makeScriptAdvanceHarness();

    const startupAdvanced = advanceWidgetStartupFromScript({
      mode: 'single-step',
      startupOpeningLength: 24,
      advanceOneWidgetCard: harness.advanceOneWidgetCard
    });

    for (let i = 0; i < 4; i += 1) {
      const moved = harness.advanceOneWidgetCard();
      expect(moved).toBe(true);
    }

    expect(startupAdvanced).toBe(1);
    expect(harness.getCursor()).toBe(5);
    expect(harness.history.slice(0, 5)).toEqual(['S7', 'SA', 'S6', 'S5', 'H2']);
  });
});

