import type { Problem } from '../core';
import { p001 } from '../puzzles/p001';
import { p002, p002Experimental } from '../puzzles/p002';
import { p003 } from '../puzzles/p003';
import { p004 } from '../puzzles/p004';
import { p005 } from '../puzzles/p005';
import { p006 } from '../puzzles/p006';
import { p008 } from '../puzzles/p008';
import { p009 } from '../puzzles/p009';
import { p010 } from '../puzzles/p010';
import { p011 } from '../puzzles/p011';
import { p012 } from '../puzzles/p012';
import { p013 } from '../puzzles/p013';
import { squeezeSelf01 } from '../puzzles/squeeze_self_01';
import { experimentalDraft01, experimentalDraft01a, experimentalDraft01b } from '../puzzles/experimental_draft';
import {
  buildSureTricksDemo,
  buildSureTricksDemoVariant,
  buildSureTricksRuffOrSluffEnding,
  buildSureTricksRuffOrSluffEndingVariant,
  sureTricksDemo,
  sureTricksRuffOrSluffEnding
} from '../puzzles/sure_tricks_demo';
import {
  ruffOrSluff01,
  ruffOrSluff01c,
  ruffOrSluff01dDiamond,
  ruffOrSluff01dSpade,
  ruffOrSluff02,
  ruffOrSluff03,
  ruffOrSluff04,
  ruffOrSluff04b,
  ruffOrSluff05,
  ruffOrSluff06,
  ruffOrSluff07,
  ruffOrSluff08,
  ruffOrSluff09,
  ruffOrSluff10,
  ruffOrSluff11
} from '../puzzles/ruff_or_sluff';
import {
  gorillas01,
  gorillas02,
  gorillas03,
  gorillas04,
  gorillas05,
  gorillas06,
  gorillas07,
  gorillas08,
  gorillas09,
  gorillas10,
  gorillas11,
  gorillas12a,
  gorillas12b,
  gorillasFullDeal
} from '../puzzles/gorillas';
import { listEncapsulationWorkbenchEntries, loadEncapsulationWorkbenchProblem } from '../encapsulation/workbenchProblems';

export type DemoProblem = {
  id: string;
  label: string;
  puzzleModeId?: 'standard' | 'single-dummy' | 'multi-ew' | 'scripted' | 'draft';
  problem?: Problem;
  loadProblem?: () => Problem;
  variants?: DemoProblemVariant[];
  defaultVariantId?: string;
  practiceEligible?: boolean;
  experimental?: boolean;
  articlePath?: string;
};

export type DemoProblemVariant = {
  id: string;
  label: string;
  problem?: Problem;
  loadProblem?: () => Problem;
};

const cachedById = new Map<string, Problem>();

function normalizeVariantId(raw?: string | null): string | null {
  const trimmed = raw?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export function resolveDemoProblemVariant(entry: DemoProblem, variantId?: string | null): DemoProblemVariant | null {
  if (!entry.variants || entry.variants.length === 0) return null;
  const requested = normalizeVariantId(variantId) ?? normalizeVariantId(entry.defaultVariantId);
  return entry.variants.find((variant) => normalizeVariantId(variant.id) === requested) ?? entry.variants[0] ?? null;
}

export function normalizeDemoProblemVariantId(entry: DemoProblem, variantId?: string | null): string | null {
  return resolveDemoProblemVariant(entry, variantId)?.id ?? null;
}

export function resolveDemoProblem(entry: DemoProblem, variantId?: string | null): Problem {
  const variant = normalizeVariantId(variantId) ? resolveDemoProblemVariant(entry, variantId) : null;
  const cacheKey = variant ? `${entry.id}::${variant.id}` : entry.id;
  const cached = cachedById.get(cacheKey);
  if (cached) return cached;
  const loaded = variant ? (variant.problem ?? variant.loadProblem?.()) : (entry.problem ?? entry.loadProblem?.());
  if (!loaded) throw new Error(`Demo problem '${entry.id}' has no problem payload`);
  cachedById.set(cacheKey, loaded);
  return loaded;
}

const encapsulationDemoProblems: DemoProblem[] = listEncapsulationWorkbenchEntries().map((entry) => ({
  id: entry.id,
  label: entry.name,
  loadProblem: () => loadEncapsulationWorkbenchProblem(entry.id),
  practiceEligible: false
}));

export const demoProblems: DemoProblem[] = [
  {
    id: 'squeeze_self_01',
    label: 'Focus on the squeeze against yourself',
    problem: squeezeSelf01,
    articlePath: 'articles/squeeze-self/'
  },
  { id: 'experimental_draft_01', label: 'experimental_draft_01', problem: experimentalDraft01, practiceEligible: false, articlePath: 'articles/experimental-draft/' },
  { id: 'experimental_draft_01a', label: 'experimental_draft_01a', problem: experimentalDraft01a, practiceEligible: false },
  { id: 'experimental_draft_01b', label: 'experimental_draft_01b', problem: experimentalDraft01b, practiceEligible: false },
  {
    id: 'sure_tricks_demo',
    label: 'Sure-tricks Demo',
    problem: sureTricksDemo,
    variants: [
      { id: 'a', label: 'Version A', loadProblem: () => buildSureTricksDemoVariant('a') },
      { id: 'b', label: 'Version B', loadProblem: () => buildSureTricksDemoVariant('b') }
    ],
    defaultVariantId: 'a',
    articlePath: 'articles/sure-tricks-demo/'
  },
  {
    id: 'sure_tricks_ruff_or_sluff_ending',
    label: 'sure_tricks_ruff_or_sluff_ending',
    problem: sureTricksRuffOrSluffEnding,
    puzzleModeId: 'draft',
    variants: [
      { id: 'a', label: 'Version A', loadProblem: () => buildSureTricksRuffOrSluffEndingVariant('a') },
      { id: 'b', label: 'Version B', loadProblem: () => buildSureTricksRuffOrSluffEndingVariant('b') }
    ],
    defaultVariantId: 'a',
    practiceEligible: false
  },
  { id: 'ruff_or_sluff_01', label: 'ruff_or_sluff_01', problem: ruffOrSluff01, practiceEligible: false, articlePath: 'articles/ruff-or-sluff/' },
  { id: 'ruff_or_sluff_01c', label: 'ruff_or_sluff_01c', problem: ruffOrSluff01c, practiceEligible: false },
  { id: 'ruff_or_sluff_01d_spade', label: 'ruff_or_sluff_01d_spade', problem: ruffOrSluff01dSpade, practiceEligible: false },
  { id: 'ruff_or_sluff_01d_diamond', label: 'ruff_or_sluff_01d_diamond', problem: ruffOrSluff01dDiamond, practiceEligible: false },
  { id: 'ruff_or_sluff_02', label: 'ruff_or_sluff_02', problem: ruffOrSluff02, practiceEligible: false },
  { id: 'ruff_or_sluff_03', label: 'ruff_or_sluff_03', problem: ruffOrSluff03, practiceEligible: false, articlePath: 'articles/ruff-or-sluff/' },
  { id: 'ruff_or_sluff_04', label: 'ruff_or_sluff_04', problem: ruffOrSluff04, practiceEligible: false },
  { id: 'ruff_or_sluff_04b', label: 'ruff_or_sluff_04b', problem: ruffOrSluff04b, practiceEligible: false },
  { id: 'ruff_or_sluff_05', label: 'ruff_or_sluff_05', problem: ruffOrSluff05, practiceEligible: false },
  { id: 'ruff_or_sluff_06', label: 'ruff_or_sluff_06', problem: ruffOrSluff06, practiceEligible: false },
  { id: 'ruff_or_sluff_07', label: 'ruff_or_sluff_07', problem: ruffOrSluff07, practiceEligible: false },
  { id: 'ruff_or_sluff_08', label: 'ruff_or_sluff_08', problem: ruffOrSluff08, practiceEligible: false },
  { id: 'ruff_or_sluff_09', label: 'ruff_or_sluff_09', problem: ruffOrSluff09, practiceEligible: false },
  { id: 'ruff_or_sluff_10', label: 'ruff_or_sluff_10', problem: ruffOrSluff10, practiceEligible: false },
  { id: 'ruff_or_sluff_11', label: 'ruff_or_sluff_11', problem: ruffOrSluff11, practiceEligible: false },
  { id: 'p001', label: 'p001', problem: p001 },
  { id: 'p002', label: 'p002', problem: p002, experimental: p002Experimental },
  { id: 'p003', label: 'p003', problem: p003 },
  { id: 'p004', label: 'p004', problem: p004 },
  { id: 'p005', label: 'p005', problem: p005 },
  { id: 'p006', label: 'p006', problem: p006 },
  { id: 'p008', label: 'p008', problem: p008 },
  { id: 'p009', label: 'p009', problem: p009 },
  { id: 'p010', label: 'p010', problem: p010 },
  { id: 'p011', label: 'p011', problem: p011 },
  { id: 'p012', label: 'p012', problem: p012 },
  { id: 'p013', label: 'p013', problem: p013 },
  { id: 'gorillas_01', label: 'gorillas_01', problem: gorillas01, practiceEligible: false },
  { id: 'gorillas_02', label: 'gorillas_02', problem: gorillas02, practiceEligible: false },
  { id: 'gorillas_03', label: 'gorillas_03', problem: gorillas03, practiceEligible: false },
  { id: 'gorillas_04', label: 'gorillas_04', problem: gorillas04, practiceEligible: false },
  { id: 'gorillas_05', label: 'gorillas_05', problem: gorillas05, practiceEligible: false },
  { id: 'gorillas_full_deal', label: 'gorillas_full_deal', problem: gorillasFullDeal, practiceEligible: false },
  { id: 'gorillas_06', label: 'gorillas_06', problem: gorillas06, practiceEligible: false },
  { id: 'gorillas_07', label: 'gorillas_07', problem: gorillas07, practiceEligible: false },
  { id: 'gorillas_08', label: 'gorillas_08', problem: gorillas08, practiceEligible: false },
  { id: 'gorillas_09', label: 'gorillas_09', problem: gorillas09, practiceEligible: false },
  { id: 'gorillas_10', label: 'gorillas_10', problem: gorillas10, practiceEligible: false },
  { id: 'gorillas_11', label: 'gorillas_11', problem: gorillas11, practiceEligible: false },
  { id: 'gorillas_12a', label: 'gorillas_12a', problem: gorillas12a, practiceEligible: false },
  { id: 'gorillas_12b', label: 'gorillas_12b', problem: gorillas12b, practiceEligible: false },
  ...encapsulationDemoProblems
];
