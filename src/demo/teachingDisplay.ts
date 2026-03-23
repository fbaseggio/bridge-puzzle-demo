// Architecture guard rails:
// - Approved dependency direction for display code is:
//   regular semantic state -> regular display projection
//   unknown-mode semantics -> merge(regular display projections)
// - Unapproved dependency direction is:
//   display code recomputing semantic meaning from raw hands/events/state internals.
// - If a future change needs new semantic derivation outside the shared semantic layer,
//   stop and ask before adding it.

export type TeachingDisplayVariantGroup = {
  labels: string[];
  summary: string;
  reasons: string[];
  effects: string[];
};

export type TeachingDisplayEntryInput = {
  summary: string;
  reasons: string[];
  effects: string[];
  variantGroups?: TeachingDisplayVariantGroup[];
};

export type TeachingDisplayVariantLine = {
  labels: string[];
  summary: string;
  ddError: string | null;
};

export type TeachingDisplayEntry = {
  summary: string;
  bracketText: string | null;
  ddError: string | null;
  variantLines: TeachingDisplayVariantLine[];
  effects: string[];
};

export type TeachingDisplayListEntry = TeachingDisplayEntry & {
  seq?: number;
  seat?: string;
};

export type WidgetNarrationDisplayEntry = {
  text: string;
  lines: string[];
  seq?: number;
  seat?: string;
};

export function splitDdErrorSummary(summary: string): { summary: string; ddError: string | null } {
  const marker = ' DD Error.';
  if (!summary.endsWith(marker)) return { summary, ddError: null };
  return {
    summary: summary.slice(0, -marker.length).trimEnd(),
    ddError: 'DD Error.'
  };
}

function parseDdReason(reason: string): { short: string; full: string } | null {
  if (!reason.startsWith('DD:')) return null;
  const full = reason.slice(3);
  const short = full.split('; alternatives')[0] ?? full;
  return { short: short.trim(), full: full.trim() };
}

export function buildTeachingDisplayEntry(
  entry: TeachingDisplayEntryInput,
  verboseDetail: boolean
): TeachingDisplayEntry {
  if (entry.variantGroups && entry.variantGroups.length > 0) {
    return {
      summary: '',
      bracketText: null,
      ddError: null,
      variantLines: entry.variantGroups.map((group) => {
        const parsed = splitDdErrorSummary(group.summary);
        return {
          labels: [...group.labels],
          summary: parsed.summary,
          ddError: parsed.ddError
        };
      }),
      effects: []
    };
  }

  const parsed = splitDdErrorSummary(entry.summary);
  const ddReasons = (entry.reasons ?? [])
    .map(parseDdReason)
    .filter((item): item is { short: string; full: string } => Boolean(item));
  const nonDdReasons = (entry.reasons ?? []).filter((reason) => !reason.startsWith('DD:'));
  const bracketParts: string[] = [];
  if (ddReasons.length > 0) {
    bracketParts.push(...ddReasons.map((item) => (verboseDetail ? item.full : item.short)));
  }
  if (verboseDetail && nonDdReasons.length > 0) {
    bracketParts.push(...nonDdReasons);
  }

  return {
    summary: parsed.summary,
    bracketText: bracketParts.length > 0 ? bracketParts.join('; ') : null,
    ddError: parsed.ddError,
    variantLines: [],
    effects: [...(entry.effects ?? [])]
  };
}

export function buildTeachingDisplayEntries<T extends TeachingDisplayEntryInput & { seq?: number; seat?: string }>(
  entries: T[],
  verboseDetail: boolean
): TeachingDisplayListEntry[] {
  return entries.map((entry) => {
    const display = buildTeachingDisplayEntry(entry, verboseDetail);
    return {
      ...display,
      seq: entry.seq,
      seat: entry.seat
    };
  });
}

function summarizeForNarration(summary: string): string {
  const trimmed = summary.replace(/^\s*#\d+\s*/, '').trim();
  return trimmed.replace(/\b([SHDC])(10|[AKQJT2-9])\b/g, (_m, suit: string, rank: string) => {
    const sym = suit === 'S' ? '♠' : suit === 'H' ? '♥' : suit === 'D' ? '♦' : '♣';
    const r = rank === '10' ? '10' : rank;
    return `${sym}${r}`;
  });
}

export function buildWidgetNarrationEntries(
  displayEntries: TeachingDisplayListEntry[]
): WidgetNarrationDisplayEntry[] {
  return displayEntries.flatMap((entry) => {
    const lines = entry.variantLines.length > 0
      ? entry.variantLines.slice(0, 2)
        .map((group) => {
          const summary = summarizeForNarration(group.summary);
          const ddError = group.ddError && !summary.endsWith(group.ddError) ? ` ${group.ddError}` : '';
          return `${group.labels.join('/')}: ${summary}${ddError}`.trim();
        })
        .filter((line) => line.length > 0)
      : [summarizeForNarration(entry.summary + (entry.ddError && !entry.summary.endsWith(entry.ddError) ? ` ${entry.ddError}` : ''))].filter((line) => line.length > 0);
    if (lines.length === 0) return [];
    return [{
      text: lines.join('\n'),
      lines,
      seq: entry.seq,
      seat: entry.seat
    }];
  });
}
