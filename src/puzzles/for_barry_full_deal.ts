import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };

export const forBarryFullDeal: ThreatProblem = {
  id: 'for_barry_full_deal',
  source: {
    title: 'For Barry'
  },
  scriptedOpening: [['HK']],
  contract: { strain: 'H' },
  leader: 'W',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 11 },
  hands: {
    N: { S: ['Q', '3', '2'], H: ['A', 'J', '8', '7'], D: ['5', '4', '3'], C: ['Q', '9', '7'] },
    E: { S: ['K', '9', '8', '7', '5'], H: ['9', '6', '5', '4'], D: ['7'], C: ['K', 'T', '3'] },
    S: { S: ['A', 'J', 'T'], H: ['Q', 'T', '3', '2'], D: ['A', 'Q', '2'], C: ['A', 'J', '2'] },
    W: { S: ['6', '4'], H: ['K'], D: ['K', 'J', 'T', '9', '8', '6'], C: ['8', '6', '5', '4'] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  threatCardIds: ['SQ', 'H8'],
  assetCardIds: ['DK', 'D6', 'C8', 'C6', 'C5'],
  rngSeed: 3303
};
