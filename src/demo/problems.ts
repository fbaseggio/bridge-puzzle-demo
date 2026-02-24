import type { Problem } from '../core';
import { p001 } from '../puzzles/p001';
import { p002 } from '../puzzles/p002';
import { p003 } from '../puzzles/p003';
import { p004 } from '../puzzles/p004';

export type DemoProblem = {
  id: string;
  label: string;
  problem: Problem;
};

export const demoProblems: DemoProblem[] = [
  { id: 'p001', label: 'p001', problem: p001 },
  { id: 'p002', label: 'p002', problem: p002 },
  { id: 'p003', label: 'p003', problem: p003 },
  { id: 'p004', label: 'p004', problem: p004 }
];
