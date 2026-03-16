import type { Problem } from '../core';
import { buildEncapsulationWorkbenchProblem, listEncapsulationWorkbenchEntries } from '../encapsulation/workbenchProblems';
import { demoProblems, resolveDemoProblem } from './problems';

export type PracticeSetId = 'set1' | 'set2';

export type PracticeQueueEntry = {
  id: string;
  label: string;
  problem: Problem;
  source: 'authored' | 'encapsulation-standard' | 'encapsulation-random';
};

export const PRACTICE_SET_OPTIONS: Array<{ id: PracticeSetId; label: string }> = [
  { id: 'set1', label: 'Set 1 — Current Puzzles' },
  { id: 'set2', label: 'Set 2 — Encapsulation Bindings' }
];

function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildSet1Entries(): PracticeQueueEntry[] {
  return demoProblems
    .filter((p) => p.id !== 'p002' && p.practiceEligible !== false)
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      problem: resolveDemoProblem(entry),
      source: 'authored' as const
    }));
}

function buildSet2Entries(seed: number): PracticeQueueEntry[] {
  const entries: PracticeQueueEntry[] = [];
  const encapEntries = listEncapsulationWorkbenchEntries();
  encapEntries.forEach((entry, index) => {
    const standardId = `${entry.id}__standard`;
    const randomId = `${entry.id}__random`;
    entries.push({
      id: standardId,
      label: `${entry.encapsulation} [standard]`,
      problem: buildEncapsulationWorkbenchProblem(entry, { bindingMode: 'standard', problemId: standardId }),
      source: 'encapsulation-standard'
    });
    entries.push({
      id: randomId,
      label: `${entry.encapsulation} [random]`,
      problem: buildEncapsulationWorkbenchProblem(entry, {
        bindingMode: 'random',
        randomSeed: (seed + index * 7919 + 17) >>> 0,
        problemId: randomId
      }),
      source: 'encapsulation-random'
    });
  });
  return entries;
}

export function buildPracticeQueue(setId: PracticeSetId, options?: { seed?: number }): PracticeQueueEntry[] {
  const seed = options?.seed ?? ((Date.now() ^ 0x9e3779b9) >>> 0);
  const rng = createSeededRng(seed);
  const base = setId === 'set2' ? buildSet2Entries(seed) : buildSet1Entries();
  return shuffle(base, rng);
}

