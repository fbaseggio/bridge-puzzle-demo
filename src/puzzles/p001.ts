import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };

export const p001: ThreatProblem = {
  id: 'p001',
  contract: { strain: 'NT' },
  leader: 'S',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 3 },
  hands: {
    N: { S: ['A', '8'], H: ['8'], D: [], C: [] },
    E: { S: [], H: [], D: ['A', 'K', 'Q'], C: [] },
    S: { S: ['5'], H: [], D: ['2'], C: ['A'] },
    W: { S: ['K', 'J'], H: ['A'], D: [], C: [] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  rngSeed: 101,
  threatCardIds: ['H8', 'S8']
};
