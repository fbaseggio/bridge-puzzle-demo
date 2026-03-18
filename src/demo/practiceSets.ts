import type { Problem } from '../core';
import { buildEncapsulationWorkbenchProblem, listEncapsulationWorkbenchEntries } from '../encapsulation/workbenchProblems';
import { demoProblems, resolveDemoProblem } from './problems';

export type PracticeSetId = 'set1' | 'set2' | 'set3' | 'set4';

export type PracticeQueueEntry = {
  id: string;
  label: string;
  problem: Problem;
  source: 'authored' | 'encapsulation-standard' | 'encapsulation-random';
};

export const PRACTICE_SET_OPTIONS: Array<{ id: PracticeSetId; label: string }> = [
  { id: 'set1', label: 'Set 1 — Current Puzzles' },
  { id: 'set2', label: 'Set 2 — Encapsulation Bindings' },
  { id: 'set3', label: 'Set 3 — Double Squeezes' },
  { id: 'set4', label: 'Set 4 — Compound Squeezes' }
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

const DOUBLE_SQUEEZE_AUTHORED_IDS = new Set(['p003', 'p007', 'p008']);
const DOUBLE_SQUEEZE_ENCAP_IDS = new Set([
  'encap_wwc_gt_a_b_w',
  'encap_a_wc_gt_a_w',
  'encap_wa_wb_gt_wc_ww'
]);
const COMPOUND_SQUEEZE_ENCAP_IDS = new Set([
  'encap_a_wc_gt_wwc_ww',
  'encap_wwa_ww_gt_wc_wc',
  'encap_wa_ww_gt_wlc_wc_b',
  'encap_wa_ww_alt_gt_wc_wc',
  'encap_a_ww_gt_wlc_wc',
  'encap_wa_ww_gt_wc_wc_b',
  'encap_wla_wc_gt_wc_ww',
  'encap_wa_wlc_gt_wc_ww',
  'encap_la_wc_gt_wlc_ww',
  'encap_a_wlc_gt_wlc_ww',
  'encap_wwa_wc_gt_wc_ww'
]);

function buildSet3Entries(): PracticeQueueEntry[] {
  const entries: PracticeQueueEntry[] = [];

  for (const entry of demoProblems) {
    if (!DOUBLE_SQUEEZE_AUTHORED_IDS.has(entry.id)) continue;
    entries.push({
      id: entry.id,
      label: entry.label,
      problem: resolveDemoProblem(entry),
      source: 'authored'
    });
  }

  for (const entry of listEncapsulationWorkbenchEntries()) {
    if (!DOUBLE_SQUEEZE_ENCAP_IDS.has(entry.id)) continue;
    const standardId = `${entry.id}__standard`;
    entries.push({
      id: standardId,
      label: `${entry.encapsulation} [standard]`,
      problem: buildEncapsulationWorkbenchProblem(entry, { bindingMode: 'standard', problemId: standardId }),
      source: 'encapsulation-standard'
    });
  }

  return entries;
}

function buildSet4Entries(): PracticeQueueEntry[] {
  const entries: PracticeQueueEntry[] = [];
  for (const entry of listEncapsulationWorkbenchEntries()) {
    if (!COMPOUND_SQUEEZE_ENCAP_IDS.has(entry.id)) continue;
    const standardId = `${entry.id}__standard`;
    entries.push({
      id: standardId,
      label: `${entry.encapsulation} [standard]`,
      problem: buildEncapsulationWorkbenchProblem(entry, { bindingMode: 'standard', problemId: standardId }),
      source: 'encapsulation-standard'
    });
  }
  return entries;
}

export function buildPracticeQueue(setId: PracticeSetId, options?: { seed?: number }): PracticeQueueEntry[] {
  const seed = options?.seed ?? ((Date.now() ^ 0x9e3779b9) >>> 0);
  const rng = createSeededRng(seed);
  const base =
    setId === 'set2'
      ? buildSet2Entries(seed)
      : setId === 'set3'
        ? buildSet3Entries()
        : setId === 'set4'
          ? buildSet4Entries()
          : buildSet1Entries();
  return shuffle(base, rng);
}
