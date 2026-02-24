import type { Problem } from '../core';

// Source notes from user:
// - title: "p002 — 8-card remainder, clubs trumps, NS needs 7/8"
// - goal shape was mapped to v0.1 Goal ({ type:'minTricks', n:7 })
export const p002: Problem = {
  id: 'p002',
  contract: { strain: 'C' },
  leader: 'S',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 7 },
  hands: {
    N: {
      S: ['A', 'Q', '9', '5', '4'],
      H: ['A', 'K', '2'],
      D: [],
      C: []
    },
    W: {
      S: ['J', 'T', '8'],
      H: ['Q', 'T', '8'],
      D: ['A', 'Q'],
      C: []
    },
    E: {
      S: ['K', '7', '6'],
      H: ['J', '9', '7'],
      D: ['K', 'J'],
      C: []
    },
    S: {
      S: [],
      H: ['4', '3'],
      D: ['6', '5', '4'],
      C: ['T', '9', '8']
    }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  threatCardIds: ['S9', 'H2', 'D5'],
  preferredDiscards: {
    W: 'DA',
    E: 'H7'
  },
  rngSeed: 202
};
