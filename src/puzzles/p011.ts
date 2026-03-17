import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };

export const p011: ThreatProblem = {
  id: 'p011',
  contract: { strain: 'NT' },
  leader: 'S',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 5 },
  hands: {
    N: { S: ['A', '9', '3'], H: ['A', '3'], D: [], C: ['2'] },
    E: { S: ['4'], H: ['K', 'Q', '6', '4'], D: [], C: ['K'] },
    S: { S: ['K', '2'], H: ['J', '2'], D: ['K'], C: ['A'] },
    W: { S: ['Q', 'J', 'T'], H: ['7', '5'], D: ['A'], C: [] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  rngSeed: 411,
  threatCardIds: ['S9', 'HJ', 'DK']
};
