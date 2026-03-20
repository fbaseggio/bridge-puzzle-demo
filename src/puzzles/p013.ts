import type { Problem } from '../core';

export const p013: Problem = {
  id: 'p013',
  source: {
    author: 'Ivar Andersson',
    url: 'https://doubledummy.net/Coffin082.html'
  },
  contract: { strain: 'NT' },
  leader: 'S',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 6 },
  hands: {
    N: { S: [], H: ['A', '3'], D: ['Q', '5'], C: ['A', '4'] },
    E: { S: ['9', '8'], H: ['7', '6'], D: ['9', '7'], C: [] },
    S: { S: ['K', '5'], H: ['J'], D: ['2'], C: ['5', '2'] },
    W: { S: ['7'], H: ['K', '4'], D: ['J', '6'], C: ['3'] }
  },
  policies: {
    E: { kind: 'randomLegal' },
    W: { kind: 'randomLegal' }
  },
  rngSeed: 613
};

