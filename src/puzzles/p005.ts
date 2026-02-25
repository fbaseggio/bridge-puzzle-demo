import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };

export const p005: ThreatProblem = {
  id: 'p005',
  contract: { strain: 'NT' },
  leader: 'S',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 4 },
  hands: {
    N: { S: ['A', '8'], H: [], D: [], C: ['A', '2'] },
    E: { S: ['K', 'J'], H: ['A'], D: ['A'], C: [] },
    S: { S: ['5'], H: ['8'], D: [], C: ['K', '3'] },
    W: { S: ['9'], H: ['5'], D: ['K', 'Q'], C: [] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  rngSeed: 405,
  threatCardIds: ['S8', 'H8']
};
