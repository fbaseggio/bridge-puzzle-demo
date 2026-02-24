import type { SuccessfulTranscript } from '../core';

export function triedAltKey(problemId: string, decisionIndex: number, chosenBucket: string, altClassId: string): string {
  return `${problemId}|${decisionIndex}|${chosenBucket}|${altClassId}`;
}

export function hasUntriedAlternatives(
  transcript: SuccessfulTranscript | null,
  triedSet: Set<string>
): { ok: boolean; lastCandidateIndex?: number; reason?: string } {
  if (!transcript || transcript.decisions.length === 0) {
    return { ok: false, reason: 'no-untried-same-bucket-alternatives' };
  }
  for (let i = transcript.decisions.length - 1; i >= 0; i -= 1) {
    const rec = transcript.decisions[i];
    const untried = rec.sameBucketAlternativeClassIds.find(
      (altClassId) => !triedSet.has(triedAltKey(transcript.problemId, rec.index, rec.chosenBucket, altClassId))
    );
    if (untried) return { ok: true, lastCandidateIndex: rec.index };
  }
  return { ok: false, reason: 'no-untried-same-bucket-alternatives' };
}
