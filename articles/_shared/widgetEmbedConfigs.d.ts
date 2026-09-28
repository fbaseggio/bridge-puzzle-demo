export const GORILLAS_FULL_DEAL_SD_PUZZLE_CONFIG_ID: 'gorillas-full-deal-sd-puzzle';
export const IF_YOU_SEE_A_GOOD_PLAY_SD_PUZZLE_CONFIG_ID: 'if-you-see-a-good-play-sd-puzzle';
export const WHICH_SQUEEZE_1_SD_PUZZLE_CONFIG_ID: 'which-squeeze-1-sd-puzzle';

export function resolveSharedWidgetEmbedQuery(configId: string): Readonly<Record<string, string>> | null;
export function buildWorkbenchWidgetSrc(queryParams: Readonly<Record<string, string>>): string;
export function resolveSharedWidgetEmbedSrc(configId: string): string | null;
