// Architecture guard rails:
// - Approved dependency direction for unknown-mode display is:
//   per-variant regular/semantic display entries -> unknown-mode merged display entries.
// - Unapproved dependency direction is renderer code regrouping variant entries inline.
// - If future unknown-mode rendering needs new merge semantics, add them here rather
//   than rebuilding them inside main.ts.

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
  entries: UnknownModeTeachingEntry[];
  ddsSummaries: string[];
};

export function mergeUnknownTeachingEntries(
  perVariant: Map<string, UnknownModeVariantReplay>,
  labelForVariant: (variantId: string) => string
): UnknownModeTeachingEntry[] {
  if (perVariant.size <= 1) return [];

  const maxEntries = Math.max(...[...perVariant.values()].map((variant) => variant.entries.length), 0);
  const merged: UnknownModeTeachingEntry[] = [];
  for (let i = 0; i < maxEntries; i += 1) {
    const present = [...perVariant.entries()]
      .map(([variantId, replay]) => ({ variantId, entry: replay.entries[i] }))
      .filter((item): item is { variantId: string; entry: UnknownModeTeachingEntry } => Boolean(item.entry));
    if (present.length === 0) continue;

    const base = present[0].entry;
    const groups = new Map<string, NonNullable<UnknownModeTeachingEntry['variantGroups']>[number]>();
    for (const { variantId, entry } of present) {
      const key = JSON.stringify([entry.summary, entry.reasons, entry.effects]);
      const existing = groups.get(key);
      if (existing) {
        existing.labels.push(labelForVariant(variantId));
      } else {
        groups.set(key, {
          labels: [labelForVariant(variantId)],
          summary: entry.summary,
          reasons: [...entry.reasons],
          effects: [...entry.effects]
        });
      }
    }

    const variantGroups = [...groups.values()];
    merged.push(variantGroups.length === 1 ? { ...base } : { ...base, variantGroups });
  }

  return merged;
}

export function mergeUnknownDdsSummaries(
  perVariant: Map<string, UnknownModeVariantReplay>,
  labelForVariant: (variantId: string) => string
): Array<string | { labels: string[]; text: string }[]> {
  if (perVariant.size <= 1) return [];

  const maxEntries = Math.max(...[...perVariant.values()].map((variant) => variant.ddsSummaries.length), 0);
  const merged: Array<string | { labels: string[]; text: string }[]> = [];
  for (let i = 0; i < maxEntries; i += 1) {
    const present = [...perVariant.entries()]
      .map(([variantId, replay]) => ({ variantId, text: replay.ddsSummaries[i] }))
      .filter((item): item is { variantId: string; text: string } => typeof item.text === 'string' && item.text.length > 0);
    if (present.length === 0) {
      merged.push('');
      continue;
    }
    const groups = new Map<string, { labels: string[]; text: string }>();
    for (const { variantId, text } of present) {
      const existing = groups.get(text);
      if (existing) {
        existing.labels.push(labelForVariant(variantId));
      } else {
        groups.set(text, { labels: [labelForVariant(variantId)], text });
      }
    }
    const grouped = [...groups.values()];
    merged.push(grouped.length === 1 ? grouped[0].text : grouped);
  }
  return merged;
}
