import type { ArticleScriptWidgetTransportOutcome } from './articleScriptWidgetTransport';

export function shouldRenderForWidgetTransportOutcome(
  outcome: ArticleScriptWidgetTransportOutcome,
  options: { renderOnPause?: boolean } = {}
): boolean {
  if (outcome === 'advanced') return true;
  if (outcome === 'paused') return options.renderOnPause !== false;
  return false;
}
