export const GORILLAS_FULL_DEAL_SD_PUZZLE_CONFIG_ID = 'gorillas-full-deal-sd-puzzle';
export const IF_YOU_SEE_A_GOOD_PLAY_SD_PUZZLE_CONFIG_ID = 'if-you-see-a-good-play-sd-puzzle';

const SHARED_WIDGET_QUERY_BY_CONFIG_ID = Object.freeze({
  [GORILLAS_FULL_DEAL_SD_PUZZLE_CONFIG_ID]: Object.freeze({
    mode: 'widget',
    uiMode: 'sd-puzzle',
    start: '1',
    opening: 'S5.S6.SJ.SA',
    problem: 'gorillas_full_deal',
    reading: '1'
  }),
  [IF_YOU_SEE_A_GOOD_PLAY_SD_PUZZLE_CONFIG_ID]: Object.freeze({
    mode: 'widget',
    uiMode: 'sd-puzzle',
    start: '1',
    opening: 'D5',
    problem: 'if_you_see_a_good_play_full_deal',
    reading: '1'
  })
});

export function resolveSharedWidgetEmbedQuery(configId) {
  return SHARED_WIDGET_QUERY_BY_CONFIG_ID[configId] ?? null;
}

export function buildWorkbenchWidgetSrc(queryParams) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (!value) continue;
    search.set(key, value);
  }
  return `/workbench/?${search.toString()}`;
}

export function resolveSharedWidgetEmbedSrc(configId) {
  const query = resolveSharedWidgetEmbedQuery(configId);
  if (!query) return null;
  return buildWorkbenchWidgetSrc(query);
}
