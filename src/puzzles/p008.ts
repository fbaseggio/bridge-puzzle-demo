import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };

export const p008: ThreatProblem = {
  id: 'p008',
  contract: { strain: 'NT' },
  leader: 'S',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 5 },
  hands: {
    N: { S: ['8'], H: ['8'], D: ['5'], C: ['A', '2'] },
    E: { S: ['K'], H: ['7'], D: ['J', '9', '7'], C: [] },
    S: { S: [], H: [], D: ['A', 'K', '8'], C: ['K', '3'] },
    W: { S: ['7'], H: ['K'], D: ['Q', 'T', '6'], C: [] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  rngSeed: 408,
  threatCardIds: ['S8', 'H8', 'D8']
};
