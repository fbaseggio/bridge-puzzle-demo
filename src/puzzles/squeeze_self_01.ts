import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };

export const squeezeSelf01: ThreatProblem = {
  id: 'squeeze_self_01',
  contract: { strain: 'NT' },
  leader: 'S',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 6 },
  hands: {
    N: { S: ['A', '2'], H: ['A', 'T'], D: ['5'], C: ['2'] },
    W: { S: ['K', 'Q'], H: ['3'], D: ['K', 'J'], C: ['4'] },
    E: { S: ['3'], H: ['K', 'Q'], D: ['Q', 'T'], C: ['3'] },
    S: { S: ['T'], H: ['5'], D: ['A', '8'], C: ['A', 'K'] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  rngSeed: 1101,
  threatCardIds: ['S2', 'HT', 'D8']
};
