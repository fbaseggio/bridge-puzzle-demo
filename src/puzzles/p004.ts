import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };

export const p004: ThreatProblem = {
  id: 'p004',
  contract: { strain: 'NT' },
  leader: 'S',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 5 },
  hands: {
    N: { S: ['8'], H: ['A', '8'], D: ['5'], C: ['3', '2'] },
    E: { S: [], H: ['Q', 'T'], D: ['Q', 'T', '6'], C: ['4'] },
    S: { S: [], H: ['5'], D: ['A', 'K', '8'], C: ['A', 'K'] },
    W: { S: ['A'], H: ['K', 'J'], D: ['J', '9', '7'], C: [] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  rngSeed: 404,
  threatCardIds: ['S8', 'H8', 'D8']
};
