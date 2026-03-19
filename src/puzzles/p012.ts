import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };

export const p012: ThreatProblem = {
  id: 'p012',
  source: {
    author: 'George Coffin',
    title: "George Coffin's Collection: No. 24",
    url: 'https://doubledummy.net/Coffin024.html'
  },
  contract: { strain: 'H' },
  leader: 'S',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 7 },
  hands: {
    N: { S: ['6'], H: ['6', '4'], D: ['A', 'J', '6'], C: ['6'] },
    E: { S: [], H: ['9', '3', '2'], D: ['9', '8', '3', '2'], C: [] },
    S: { S: ['2'], H: ['A', 'J', '5'], D: ['K'], C: ['5', '2'] },
    W: { S: ['4', '3'], H: ['Q'], D: ['Q', '7'], C: ['4', '3'] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  threatCardIds: ['DJ'],
  rngSeed: 412
};
