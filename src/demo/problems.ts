import type { Problem } from '../core';
import { p001 } from '../puzzles/p001';
import { p002, p002Experimental } from '../puzzles/p002';
import { p003 } from '../puzzles/p003';
import { p004 } from '../puzzles/p004';
import { p005 } from '../puzzles/p005';
import { p006 } from '../puzzles/p006';
import { p007 } from '../puzzles/p007';
import { p008 } from '../puzzles/p008';
import { p009 } from '../puzzles/p009';

export type DemoProblem = {
  id: string;
  label: string;
  problem: Problem;
  experimental?: boolean;
};

export const demoProblems: DemoProblem[] = [
  { id: 'p001', label: 'p001', problem: p001 },
  { id: 'p002', label: 'p002', problem: p002, experimental: p002Experimental },
  { id: 'p003', label: 'p003', problem: p003 },
  { id: 'p004', label: 'p004', problem: p004 },
  { id: 'p005', label: 'p005', problem: p005 },
  { id: 'p006', label: 'p006', problem: p006 },
  { id: 'p007', label: 'p007', problem: p007 },
  { id: 'p008', label: 'p008', problem: p008 },
  { id: 'p009', label: 'p009', problem: p009 }
];
