import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };

export const p009: ThreatProblem = {
  id: 'p009',
  contract: { strain: 'NT' },
  leader: 'S',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 4 },
  hands: {
    N: { S: ['A'], H: ['8', '5'], D: [], C: ['A'] },
    E: { S: ['7'], H: ['7'], D: ['A', 'K'], C: [] },
    S: { S: ['8', '5'], H: ['A'], D: [], C: ['2'] },
    W: { S: ['K', 'J'], H: ['K', 'J'], D: [], C: [] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  rngSeed: 409,
  threatCardIds: ['H8', 'S8']
};
