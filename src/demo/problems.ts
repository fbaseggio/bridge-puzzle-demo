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
import { listEncapsulationWorkbenchEntries, loadEncapsulationWorkbenchProblem } from '../encapsulation/workbenchProblems';

export type DemoProblem = {
  id: string;
  label: string;
  problem?: Problem;
  loadProblem?: () => Problem;
  practiceEligible?: boolean;
  experimental?: boolean;
  articlePath?: string;
};

const cachedById = new Map<string, Problem>();

export function resolveDemoProblem(entry: DemoProblem): Problem {
  const cached = cachedById.get(entry.id);
  if (cached) return cached;
  const loaded = entry.problem ?? entry.loadProblem?.();
  if (!loaded) throw new Error(`Demo problem '${entry.id}' has no problem payload`);
  cachedById.set(entry.id, loaded);
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
  ...encapsulationDemoProblems
];
