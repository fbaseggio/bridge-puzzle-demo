import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };

export const doubleDummy01: ThreatProblem = {
  id: 'double_dummy_01',
  contract: { strain: 'NT' },
  leader: 'W',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 11 },
  hands: {
    N: { S: ['9', '7', '4'], H: ['A', 'K', 'T', '3', '2'], D: ['A', '3'], C: ['Q', '3', '2'] },
    W: { S: ['K', 'Q', '3', '2'], H: ['9', '7'], D: ['K', '9'], C: ['9', '7', '6', '5', '4'] },
    E: { S: ['T', '8', '6'], H: ['J', '8', '6', '5'], D: ['J', '6', '5', '4'], C: ['K', 'J'] },
    S: { S: ['A', 'J', '5'], H: ['Q', '4'], D: ['Q', 'T', '8', '7', '2'], C: ['A', 'T', '8'] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  threatCardIds: ['S9', 'HT', 'CQ'],
  rngSeed: 2501
};
