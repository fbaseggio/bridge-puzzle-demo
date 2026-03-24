import type { Problem, Rank } from '../core';
import type { CardId } from '../ai/threatModel';

type HandSpec = {
  S: Rank[];
  H: Rank[];
  D: Rank[];
  C: Rank[];
};

type DraftOpts = {
  strain: 'NT' | 'S' | 'H' | 'D' | 'C';
  goal: number;
  leader?: 'N' | 'E' | 'S' | 'W';
  notes: string[];
};

type StandardOpts = {
  strain: 'NT' | 'S' | 'H' | 'D' | 'C';
  goal: number;
  leader?: 'N' | 'E' | 'S' | 'W';
  threatCardIds?: CardId[];
  notes?: string[];
};

function makeDraftProblem(
  id: string,
  hands: { N: HandSpec; E: HandSpec; S: HandSpec; W: HandSpec },
  opts: DraftOpts
): Problem {
  return {
    id,
    contract: { strain: opts.strain },
    leader: opts.leader ?? 'S',
    userControls: ['N', 'E', 'S', 'W'],
    goal: { type: 'minTricks', side: 'NS', n: opts.goal },
    hands,
    policies: {},
    rngSeed: 1975,
    draftNotes: opts.notes,
    source: {
      author: 'Franco Baseggio',
      title: 'Ruff or Sluff'
    }
  };
}

function makeStandardProblem(
  id: string,
  hands: { N: HandSpec; E: HandSpec; S: HandSpec; W: HandSpec },
  opts: StandardOpts
): Problem {
  return {
    id,
    contract: { strain: opts.strain },
    leader: opts.leader ?? 'S',
    userControls: ['N', 'S'],
    goal: { type: 'minTricks', side: 'NS', n: opts.goal },
    hands,
    policies: {
      E: { kind: 'threatAware' },
      W: { kind: 'threatAware' }
    },
    rngSeed: 1975,
    threatCardIds: opts.threatCardIds ?? [],
    draftNotes: opts.notes,
    source: {
      author: 'Franco Baseggio',
      title: 'Ruff or Sluff'
    }
  };
}

export const ruffOrSluff01 = makeStandardProblem(
  'ruff_or_sluff_01',
  {
    N: { S: ['K', 'J'], H: [], D: ['A', '8', '6'], C: ['K', '6'] },
    W: { S: ['9', '8', '4', '3', '2'], H: [], D: [], C: ['9', '8'] },
    E: { S: ['Q', 'T'], H: [], D: ['Q', 'J', 'T', '2'], C: ['Q'] },
    S: { S: [], H: ['K', '5'], D: ['9', '7', '5', '4', '3'], C: [] }
  },
  {
    strain: 'H',
    goal: 6,
    leader: 'S',
    threatCardIds: ['D9', 'SJ']
  }
);
ruffOrSluff01.scriptedOpening = [
  ['HK', 'S2', 'D6', 'D2'],
  ['D5', 'S3', 'DA', 'DT']
];

export const ruffOrSluff02 = makeStandardProblem(
  'ruff_or_sluff_02',
  {
    N: { S: ['A', 'K', 'J'], H: ['T', '3', '2'], D: ['A', '8', '6'], C: ['K', '6', '4', '2'] },
    W: { S: ['9', '8', '7', '4', '3', '2'], H: ['9', '8', '7'], D: [], C: ['T', '9', '8', '7'] },
    E: { S: ['Q', 'T', '6'], H: ['Q', '6'], D: ['K', 'Q', 'J', 'T', '2'], C: ['Q', '5', '3'] },
    S: { S: ['5'], H: ['A', 'K', 'J', '5', '4'], D: ['9', '7', '5', '4', '3'], C: ['A', 'J'] }
  },
  {
    strain: 'H',
    goal: 12,
    leader: 'W',
    threatCardIds: ['D9', 'SJ']
  }
);
ruffOrSluff02.scriptedOpening = [
  ['S7', 'SA', 'S6', 'S5'],
  ['H2', 'H6', 'HJ', 'H7'],
  ['HA', 'H8', 'H3', 'HQ'],
  ['H4', 'H9', 'HT', 'DK'],
  ['C2', 'C3', 'CJ', 'CT'],
  ['CA', 'C7', 'C4', 'C5']
];

export const ruffOrSluff01c = makeStandardProblem(
  'ruff_or_sluff_01c',
  {
    N: { S: ['K', 'J'], H: [], D: ['8'], C: ['6'] },
    W: { S: ['9', '8', '4'], H: [], D: [], C: ['9'] },
    E: { S: ['Q', 'T'], H: [], D: ['Q', 'J'], C: [] },
    S: { S: [], H: ['5'], D: ['9', '7', '5'], C: [] }
  },
  {
    strain: 'H',
    goal: 3,
    leader: 'N',
    threatCardIds: ['D9', 'SJ']
  }
);

export const ruffOrSluff01dSpade = makeStandardProblem(
  'ruff_or_sluff_01d_spade',
  {
    N: { S: ['K', 'T'], H: [], D: ['8', '6'], C: ['6'] },
    W: { S: ['9', '8', '4', '3'], H: [], D: [], C: ['T'] },
    E: { S: ['Q', 'J'], H: [], D: ['Q', 'J', 'T'], C: [] },
    S: { S: ['5'], H: ['5'], D: ['A', '9', '7'], C: [] }
  },
  {
    strain: 'H',
    goal: 3,
    leader: 'N',
    threatCardIds: ['D7', 'ST']
  }
);

export const ruffOrSluff01dDiamond = makeStandardProblem(
  'ruff_or_sluff_01d_diamond',
  {
    N: { S: ['K', 'T'], H: [], D: ['8', '6'], C: ['6'] },
    W: { S: ['9', '8', '4', '3'], H: [], D: [], C: ['T'] },
    E: { S: ['Q', 'J'], H: [], D: ['Q', 'J', 'T'], C: [] },
    S: { S: [], H: ['5'], D: ['A', '9', '7', '3'], C: [] }
  },
  {
    strain: 'H',
    goal: 3,
    leader: 'N',
    threatCardIds: ['D7', 'ST']
  }
);

export const ruffOrSluff03 = makeStandardProblem(
  'ruff_or_sluff_03',
  {
    N: { S: ['J', '3', '2'], H: ['K', '8', '4'], D: ['K', '8', '7', '6'], C: ['A', '8', '7'] },
    W: { S: ['T', '8'], H: ['J', 'T', '9', '6', '3'], D: ['J', 'T', '9', '2'], C: ['J', '2'] },
    E: { S: ['9', '7', '6'], H: ['A', 'Q', '7'], D: ['A', '4'], C: ['Q', 'T', '6', '5', '4'] },
    S: { S: ['A', 'K', 'Q', '5', '4'], H: ['5', '2'], D: ['Q', '5', '3'], C: ['K', '9', '3'] }
  },
  {
    strain: 'S',
    goal: 10,
    leader: 'W',
    threatCardIds: ['HK']
  }
);

export const ruffOrSluff04 = makeStandardProblem(
  'ruff_or_sluff_04',
  {
    N: { S: [], H: ['K', '8', '4'], D: ['K', '8'], C: ['8'] },
    W: { S: [], H: ['J', 'T', '9', '6'], D: ['T', '9'], C: [] },
    E: { S: [], H: ['A', 'Q', '7'], D: [], C: ['T', '5', '4'] },
    S: { S: ['Q', '5'], H: ['5', '2'], D: ['5'], C: ['9'] }
  },
  {
    strain: 'S',
    goal: 5,
    leader: 'S',
    threatCardIds: ['HK']
  }
);

export const ruffOrSluff04b = makeStandardProblem(
  'ruff_or_sluff_04b',
  {
    N: { S: [], H: ['K', '8'], D: ['8'], C: ['8'] },
    W: { S: [], H: ['J', 'T', '9'], D: ['T'], C: [] },
    E: { S: [], H: ['A', 'Q'], D: [], C: ['T', '5'] },
    S: { S: ['5'], H: ['5', '2'], D: [], C: ['9'] }
  },
  {
    strain: 'S',
    goal: 3,
    leader: 'N',
    threatCardIds: ['HK']
  }
);

export const ruffOrSluff05 = makeStandardProblem(
  'ruff_or_sluff_05',
  {
    N: { S: ['4', '3', '2'], H: ['6'], D: ['A', 'K', 'J', 'T', '5'], C: ['J', '8', '3', '2'] },
    W: { S: ['7', '6', '5'], H: ['7'], D: ['Q', '9', '8', '7', '6'], C: ['A', '7', '6', '5'] },
    E: { S: ['Q', '9', '8'], H: ['A', 'K', 'Q', 'J', 'T', '9'], D: ['2'], C: ['T', '9', '4'] },
    S: { S: ['A', 'K', 'J', 'T'], H: ['8', '5', '4', '3', '2'], D: ['4', '3'], C: ['K', 'Q'] }
  },
  {
    strain: 'S',
    goal: 10,
    leader: 'W',
    threatCardIds: ['CK', 'H8']
  }
);

export const ruffOrSluff06 = makeStandardProblem(
  'ruff_or_sluff_06',
  {
    N: { S: [], H: [], D: ['5'], C: ['J', '8', '3'] },
    W: { S: [], H: [], D: ['Q'], C: ['7', '6', '5'] },
    E: { S: [], H: ['K', 'Q'], D: [], C: ['T', '9'] },
    S: { S: ['T'], H: ['8', '5'], D: [], C: ['Q'] }
  },
  {
    strain: 'S',
    goal: 3,
    leader: 'N',
    threatCardIds: ['C8', 'H5'],
    notes: [
      'Cards and goal were corrected from review, but inverse threat analysis still disagrees with the declared threats.'
    ]
  }
);

export const ruffOrSluff07 = makeStandardProblem(
  'ruff_or_sluff_07',
  {
    N: { S: ['A', '5'], H: ['Q', '5', '4'], D: [], C: ['6'] },
    W: { S: ['9', '6', '4', '3', '2'], H: [], D: [], C: ['T'] },
    E: { S: ['K', 'Q', 'J'], H: ['J', 'T', '8'], D: [], C: [] },
    S: { S: ['T', '8', '7'], H: ['3', '2'], D: ['9'], C: [] }
  },
  {
    strain: 'D',
    goal: 5,
    leader: 'N',
    threatCardIds: ['H4', 'ST'],
    notes: [
      'Cards, threats, and goal were corrected from review, but inverse threat analysis still disagrees with the declared threats.'
    ]
  }
);

export const ruffOrSluff08 = makeStandardProblem(
  'ruff_or_sluff_08',
  {
    N: { S: ['A', 'K', 'Q'], H: ['A', '7'], D: ['A', '8', '7', '4', '3'], C: ['8', '3', '2'] },
    W: { S: ['5', '4', '3', '2'], H: ['K', '6', '5', '4', '3'], D: ['2'], C: ['A', 'T', '9'] },
    E: { S: [], H: ['Q', 'J', 'T'], D: ['K', 'Q', 'J', 'T', '9'], C: ['J', '7', '6', '5', '4'] },
    S: { S: ['J', 'T', '9', '8', '7', '6'], H: ['9', '8', '2'], D: ['6', '5'], C: ['K', 'Q'] }
  },
  {
    strain: 'S',
    goal: 10,
    leader: 'W',
    threatCardIds: ['CK', 'D8', 'H9']
  }
);

export const ruffOrSluff09 = makeStandardProblem(
  'ruff_or_sluff_09',
  {
    N: { S: [], H: ['A'], D: ['A', '8', '7'], C: ['8'] },
    W: { S: [], H: ['6', '5', '4'], D: ['2'], C: ['9'] },
    E: { S: [], H: ['Q', 'J'], D: ['K', 'Q', 'J'], C: [] },
    S: { S: ['6'], H: ['9', '8'], D: ['6', '5'], C: [] }
  },
  {
    strain: 'S',
    goal: 4,
    leader: 'N',
    threatCardIds: ['D7', 'H9'],
    notes: [
      'Cards and threats were corrected from review, but hand sizes in the scan still do not reconcile cleanly.'
    ]
  }
);

export const ruffOrSluff10 = makeStandardProblem(
  'ruff_or_sluff_10',
  {
    N: { S: ['A', 'K', 'Q', '3', '2'], H: ['J', '3'], D: ['A', '7', '2'], C: ['A', 'K', 'Q'] },
    W: { S: ['J', '9', '8', '7', '6'], H: ['T', '8', '7', '6'], D: ['3'], C: ['J', '9', '2'] },
    E: { S: ['T', '5'], H: ['K', '5', '4'], D: ['K', 'Q', 'T', '9', '6', '5'], C: ['5', '3'] },
    S: { S: ['4'], H: ['A', 'Q', '9', '2'], D: ['J', '8', '4'], C: ['T', '8', '7', '6', '4'] }
  },
  {
    strain: 'C',
    goal: 12,
    leader: 'W',
    threatCardIds: ['DJ', 'H9'],
    notes: [
      'This deal is materially corrected, but inverse threat/resource validation still disagrees with the declared article reading.'
    ]
  }
);

export const ruffOrSluff11 = makeStandardProblem(
  'ruff_or_sluff_11',
  {
    N: { S: ['3'], H: ['J', '3'], D: ['7', '2'], C: [] },
    W: { S: ['J'], H: ['T', '8', '7', '6'], D: [], C: [] },
    E: { S: [], H: ['K', '5', '4'], D: ['K', 'Q'], C: [] },
    S: { S: [], H: ['A', 'Q', '9'], D: ['J'], C: ['T'] }
  },
  {
    strain: 'C',
    goal: 4,
    leader: 'N',
    threatCardIds: ['DJ', 'H9'],
    notes: [
      'Leader and threats were corrected from review, but inverse threat/resource validation still disagrees with the declared article reading.'
    ]
  }
);
