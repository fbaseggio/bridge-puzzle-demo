import type { CardId, DecisionRecord, SuccessfulTranscript } from '../core';

export function triedAltKey(problemId: string, decisionIndex: number, chosenBucket: string, altClassId: string): string {
  return `${problemId}|${decisionIndex}|${chosenBucket}|${altClassId}`;
}

function hasTriedAltClass(
  transcript: SuccessfulTranscript,
  triedSet: Set<string>,
  decisionIndex: number,
  altClassId: string
): boolean {
  const prefix = `${transcript.problemId}|${decisionIndex}|`;
  const suffix = `|${altClassId}`;
  for (const key of triedSet) {
    if (key.startsWith(prefix) && key.endsWith(suffix)) return true;
  }
  return false;
}

export function hasUntriedAlternatives(
  transcript: SuccessfulTranscript | null,
  triedSet: Set<string>
): { ok: boolean; lastCandidateIndex?: number; reason?: string } {
  const candidates = divergenceCandidates(transcript, triedSet);
  if (candidates.length === 0) return { ok: false, reason: 'no-untried-alternatives' };
  return { ok: true, lastCandidateIndex: candidates[candidates.length - 1].index };
}

export type DivergenceCandidate = { index: number; remainingClasses: string[] };

export function divergenceCandidates(
  transcript: SuccessfulTranscript | null,
  triedSet: Set<string>
): DivergenceCandidate[] {
  if (!transcript || transcript.decisions.length === 0) return [];
  const out: DivergenceCandidate[] = [];
  for (const rec of transcript.decisions) {
    const remaining = rec.sameBucketAlternativeClassIds.filter(
      (altClassId) => !hasTriedAltClass(transcript, triedSet, rec.index, altClassId)
    );
    if (remaining.length > 0) out.push({ index: rec.index, remainingClasses: remaining });
  }
  return out;
}

export type ReplayCoverage = {
  triedByIdx: Map<number, Set<string>>;
  recordedRemainingByIdx: Map<number, Set<string>>;
  representativeByIdx: Map<number, Map<string, CardId>>;
};

export function markDecisionCoverage(coverage: ReplayCoverage, rec: DecisionRecord): void {
  const tried = coverage.triedByIdx.get(rec.index) ?? new Set<string>();
  tried.add(rec.chosenAltClassId || rec.chosenClassId);
  coverage.triedByIdx.set(rec.index, tried);

  const remaining = coverage.recordedRemainingByIdx.get(rec.index) ?? new Set<string>();
  for (const cls of rec.sameBucketAlternativeClassIds) remaining.add(cls);
  coverage.recordedRemainingByIdx.set(rec.index, remaining);

  const reps = coverage.representativeByIdx.get(rec.index) ?? new Map<string, CardId>();
  for (const [cls, card] of Object.entries(rec.representativeCardByClass)) {
    reps.set(cls, card as CardId);
  }
  reps.set(rec.chosenAltClassId || rec.chosenClassId, rec.chosenCard);
  coverage.representativeByIdx.set(rec.index, reps);
}

export function computeCoverageCandidates(
  coverage: ReplayCoverage,
  allowedIndices?: Set<number>,
  maxIndexExclusive?: number | null
): Array<{ index: number; remainingKeys: string[] }> {
  const indices = [...coverage.recordedRemainingByIdx.keys()].sort((a, b) => a - b);
  const out: Array<{ index: number; remainingKeys: string[] }> = [];
  for (const idx of indices) {
    if (allowedIndices && !allowedIndices.has(idx)) continue;
    if (typeof maxIndexExclusive === 'number' && idx >= maxIndexExclusive) continue;
    const recorded = coverage.recordedRemainingByIdx.get(idx) ?? new Set<string>();
    const tried = coverage.triedByIdx.get(idx) ?? new Set<string>();
    const remainingKeys = [...recorded].filter((k) => !tried.has(k)).sort();
    if (remainingKeys.length > 0) out.push({ index: idx, remainingKeys });
  }
  return out;
}
