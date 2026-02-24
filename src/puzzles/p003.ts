import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };

export const p003: ThreatProblem = {
  id: 'p003',
  contract: { strain: 'NT' },
  leader: 'S',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 3 },
  hands: {
    N: { S: ['A', '8'], H: ['8'], D: [], C: [] },
    E: { S: ['Q', 'T'], H: [], D: ['A'], C: [] },
    S: { S: ['5'], H: [], D: ['8'], C: ['A'] },
    W: { S: ['K', 'J'], H: ['A'], D: [], C: [] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  rngSeed: 101,
  threatCardIds: ['H8', 'S8', 'D8']
};
