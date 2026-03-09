import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };

export const p010: ThreatProblem = {
  id: 'p010',
  contract: { strain: 'C', declarer: 'S' },
  leader: 'S',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 4 },
  hands: {
    N: { S: ['A'], H: ['8', '5'], D: [], C: ['A'] },
    E: { S: ['7'], H: ['7'], D: ['A'], C: ['K'] },
    S: { S: ['8', '5'], H: [], D: [], C: ['3', '2'] },
    W: { S: ['K', 'J'], H: ['K', 'J'], D: [], C: [] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  rngSeed: 410,
  threatCardIds: ['H8', 'S8']
};
