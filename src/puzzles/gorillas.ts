import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type HandSpec = {
  S: string[];
  H: string[];
  D: string[];
  C: string[];
};

function makeGorillaProblem(
  id: string,
  hands: { N: HandSpec; E: HandSpec; S: HandSpec; W: HandSpec },
  opts?: {
    strain?: 'NT' | 'S' | 'H' | 'D' | 'C';
    goal?: number;
    sourceUrl?: string;
    threatCardIds?: CardId[];
    leader?: 'N' | 'E' | 'S' | 'W';
  }
): Problem {
  const nsLen = Math.max(
    hands.N.S.length + hands.N.H.length + hands.N.D.length + hands.N.C.length,
    hands.S.S.length + hands.S.H.length + hands.S.D.length + hands.S.C.length
  );
  return {
    id,
    source: {
      author: 'Hugh Darwen',
      title: 'Gorillas (1) and (2)',
      publication: 'Bridge Magazine, June–July 1975',
      url: opts?.sourceUrl ?? 'https://example.invalid/gorillas'
    },
    contract: { strain: opts?.strain ?? 'NT' },
    leader: opts?.leader ?? 'S',
    userControls: ['N', 'S'],
    goal: { type: 'minTricks', side: 'NS', n: opts?.goal ?? nsLen },
    hands,
    policies: {
      E: { kind: 'threatAware' },
      W: { kind: 'threatAware' }
    },
    threatCardIds: opts?.threatCardIds ?? [],
    rngSeed: 613
  };
}

export const gorillas01 = makeGorillaProblem('gorillas_01', {
  N: { S: ['A', '2'], H: ['A', '2'], D: [], C: ['3', '2'] },
  E: { S: ['K', 'Q'], H: ['K', 'Q'], D: ['K', 'Q'], C: [] },
  S: { S: ['3'], H: ['3'], D: ['A', '2'], C: ['A', 'K'] },
  W: { S: ['J', 'T', '9'], H: ['J', 'T', '9'], D: [], C: [] }
}, { threatCardIds: ['S2', 'H2', 'D2'] });

export const gorillas02 = makeGorillaProblem('gorillas_02', {
  N: { S: ['A', '2'], H: ['A', '2'], D: ['3'], C: ['3'] },
  E: { S: ['K', 'Q'], H: ['K', 'Q'], D: ['K', 'Q'], C: [] },
  S: { S: ['3'], H: ['3'], D: ['A', '2'], C: ['A', 'K'] },
  W: { S: ['J', 'T', '9'], H: ['J', 'T', '9'], D: [], C: [] }
}, { threatCardIds: ['S2', 'H2', 'D2'] });

export const gorillas03 = makeGorillaProblem('gorillas_03', {
  N: { S: ['A', '2'], H: ['A', '3', '2'], D: [], C: ['2'] },
  E: { S: ['K', 'Q'], H: ['Q', '8', '7'], D: ['A'], C: [] },
  S: { S: ['3'], H: ['K', '4'], D: ['2'], C: ['A', 'K'] },
  W: { S: ['J', 'T', '9'], H: ['J', 'T', '9'], D: [], C: [] }
}, { threatCardIds: ['S2', 'H3', 'D2'] });

export const gorillas04 = makeGorillaProblem('gorillas_04', {
  N: { S: ['A', '3', '2'], H: ['A', '3', '2'], D: [], C: ['2'] },
  E: { S: ['K', 'Q'], H: ['Q', '8', '7'], D: ['K', 'Q'], C: [] },
  S: { S: ['4'], H: ['K', '4'], D: ['A', '2'], C: ['A', 'K'] },
  W: { S: ['J', 'T', '9', '8'], H: ['J', 'T', '9'], D: [], C: [] }
}, { threatCardIds: ['S3', 'H3', 'D2'] });

export const gorillas05 = makeGorillaProblem('gorillas_05', {
  N: { S: ['A', '2'], H: ['A', '2'], D: ['2'], C: ['3', '2'] },
  E: { S: ['K', 'Q'], H: ['K', 'Q'], D: ['Q', 'J', 'T'], C: [] },
  S: { S: ['3'], H: ['3'], D: ['A', 'K', '3'], C: ['A', 'K'] },
  W: { S: ['J', 'T', '9', '8'], H: ['J', 'T', '9'], D: [], C: [] }
}, { threatCardIds: ['S2', 'H2', 'D3'] });

export const gorillasFullDeal = makeGorillaProblem(
  'gorillas_full_deal',
  {
    N: { S: ['9', '8', '7', '6'], H: ['9'], D: ['A', '5', '4', '3', '2'], C: ['K', '5', '4'] },
    E: { S: ['Q', 'J', 'T', '4'], H: ['5', '4', '3'], D: ['T', '8', '6'], C: ['J', '6', '3'] },
    S: { S: ['A', 'K', '2'], H: ['A', 'K', 'Q', 'J', 'T', '2'], D: ['K', 'J'], C: ['A', '2'] },
    W: { S: ['5', '3'], H: ['8', '7', '6'], D: ['Q', '9', '7'], C: ['Q', 'T', '9', '8', '7'] }
  },
  { goal: 13, leader: 'W', threatCardIds: ['C5', 'D5', 'S2'] }
);

export const gorillas06 = makeGorillaProblem(
  'gorillas_06',
  {
    N: { S: ['A', '8'], H: ['A', '8'], D: ['A', '3', '2'], C: [] },
    E: { S: ['J', 'T', '9'], H: ['J', 'T', '9'], D: [], C: ['2'] },
    S: { S: ['4', '3'], H: ['4', '3'], D: [], C: ['A', 'K', 'Q'] },
    W: { S: ['K', 'Q'], H: ['K', 'Q'], D: ['K', 'Q', 'J'], C: [] }
  },
  { strain: 'C', threatCardIds: ['S8', 'H8', 'D3'] }
);

export const gorillas07 = makeGorillaProblem('gorillas_07', {
  N: { S: ['A', '2'], H: ['A', '2'], D: ['3', '2'], C: ['2'] },
  E: { S: ['J', 'T', '9'], H: ['9', '8', '7'], D: ['J'], C: [] },
  S: { S: ['3'], H: ['K', '4', '3'], D: ['A'], C: ['A', 'K'] },
  W: { S: ['K', 'Q'], H: ['Q', 'J', 'T'], D: ['K', 'Q'], C: [] }
}, { threatCardIds: ['S2', 'H4', 'D3'] });

export const gorillas08 = makeGorillaProblem('gorillas_08', {
  N: { S: ['A', '2'], H: ['A', '2'], D: ['3', '2'], C: ['3', '2'] },
  E: { S: ['J', 'T', '9', '8'], H: ['7', '6', '5'], D: ['J'], C: [] },
  S: { S: ['3'], H: ['K', 'Q', '4', '3'], D: ['A'], C: ['A', 'K'] },
  W: { S: ['K', 'Q'], H: ['J', 'T', '9', '8'], D: ['K', 'Q'], C: [] }
}, { threatCardIds: ['S2', 'H4', 'D3'] });

export const gorillas09 = makeGorillaProblem('gorillas_09', {
  N: { S: ['K', '4', '3'], H: ['A', '2'], D: ['2'], C: ['2'] },
  E: { S: ['9', '8', '7'], H: ['9', '8', '7'], D: [], C: ['3'] },
  S: { S: ['A', '2'], H: ['K', '4', '3'], D: [], C: ['A', 'K'] },
  W: { S: ['Q', 'J', 'T'], H: ['Q', 'J', 'T'], D: ['A'], C: [] }
}, { threatCardIds: ['S4', 'H4', 'D2'] });

export const gorillas10 = makeGorillaProblem('gorillas_10', {
  N: { S: ['A', '2'], H: ['3'], D: ['A', '3', '2'], C: ['2'] },
  E: { S: ['J', 'T', '9'], H: ['J', 'T', '9', '8'], D: [], C: [] },
  S: { S: ['3'], H: ['A', '2'], D: ['K', '4'], C: ['A', 'K'] },
  W: { S: ['K', 'Q'], H: ['K', 'Q'], D: ['Q', 'J', 'T'], C: [] }
}, { threatCardIds: ['S2', 'H2', 'D3'] });

export const gorillas11 = makeGorillaProblem('gorillas_11', {
  N: { S: ['A', '2'], H: ['A', '2'], D: ['A', '2'], C: ['2'] },
  E: { S: ['J', 'T', '9'], H: ['9', '8', '7', '6'], D: [], C: [] },
  S: { S: ['4', '3'], H: ['K', '4', '3'], D: [], C: ['A', 'K'] },
  W: { S: ['K', 'Q'], H: ['Q', 'J', 'T'], D: ['K', 'Q'], C: [] }
}, { threatCardIds: ['S4', 'H4', 'D2'] });

export const gorillas12a = makeGorillaProblem('gorillas_12a', {
  N: { S: ['A', '2'], H: ['3'], D: ['2'], C: ['3', '2'] },
  E: { S: ['J', 'T', '9'], H: ['9', '8', '7'], D: [], C: [] },
  S: { S: ['3'], H: ['A', 'K', '2'], D: [], C: ['A', 'K'] },
  W: { S: ['K', 'Q'], H: ['Q', 'J', 'T'], D: ['A'], C: [] }
}, { threatCardIds: ['S2', 'H2', 'D2'] });

export const gorillas12b = makeGorillaProblem('gorillas_12b', {
  N: { S: ['3'], H: ['A', 'K', '2'], D: [], C: ['3', '2'] },
  E: { S: ['K', 'Q'], H: ['Q', 'J', 'T'], D: ['A'], C: [] },
  S: { S: ['A', '2'], H: ['3'], D: ['2'], C: ['A', 'K'] },
  W: { S: ['J', 'T', '9'], H: ['9', '8', '7'], D: [], C: [] }
}, { threatCardIds: ['S2', 'H2', 'D2'] });

export const gorillasProblems: Problem[] = [
  gorillas01,
  gorillas02,
  gorillas03,
  gorillas04,
  gorillas05,
  gorillasFullDeal,
  gorillas06,
  gorillas07,
  gorillas08,
  gorillas09,
  gorillas10,
  gorillas11,
  gorillas12a,
  gorillas12b
];
