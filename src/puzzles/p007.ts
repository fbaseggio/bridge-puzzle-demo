import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };

export const p007: ThreatProblem = {
  id: 'p007',
  contract: { strain: 'NT' },
  leader: 'S',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 5 },
  hands: {
    N: { S: ['A', '8', '4'], H: ['A', '2'], D: [], C: ['2'] },
    E: { S: ['6'], H: ['Q', 'J', 'T', '9'], D: [], C: ['K'] },
    S: { S: ['K', '5'], H: ['5', '4'], D: ['8'], C: ['A'] },
    W: { S: ['Q', 'T', '7'], H: ['7', '6'], D: ['A'], C: [] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  rngSeed: 407,
  threatCardIds: ['S8', 'D8']
};
