import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };

export const p006: ThreatProblem = {
  id: 'p006',
  contract: { strain: 'NT' },
  leader: 'S',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 3 },
  hands: {
    N: { S: ['A', '5'], H: ['8'], D: [], C: [] },
    E: { S: ['7', '6'], H: ['7'], D: [], C: [] },
    S: { S: ['8', '2'], H: [], D: [], C: ['A'] },
    W: { S: ['K', 'J'], H: ['A'], D: [], C: [] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  rngSeed: 406,
  threatCardIds: ['H8', 'S8']
};
