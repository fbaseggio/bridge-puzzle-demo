import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };

export const whichSqueeze1: ThreatProblem = {
  id: 'which_squeeze_1',
  source: {
    title: 'Which Squeeze 1',
    url: 'https://www.bridgebase.com/tools/handviewer.html?lin=pn|~~v3fakebot,~~v3fakebot,baseggio,~~v3fakebot|st||md|2SKJ4HQ53DAK75CK84,S9HT876DT982CJ965,SQT8752HA2DQCAT32,SA63HKJ94DJ643CQ7|sv|b|rh||ah|Board%204|mb|P|mb|1S|an|Major%20suit%20opening%20--%205+%20!S;%2011-21%20HCP;%2012-22%20total%20points|mb|P|mb|3N|an|Balanced,%20choice%20of%20games.%20--%203-4%20!C;%203-4%20!D;%203-4%20!H;%203%20!S;%2013-15%20total%20points|mb|P|mb|4S|an|5+%20!S;%2011+%20HCP;%2012-17%20total%20points|mb|P|mb|P|mb|P|pc|D3|pc|D5|pc|DT|pc|DQ|pc|S5|pc|SA|pc|S4|pc|S9|pc|D6|pc|DA|pc|D2|pc|H2|pc|SK|pc|H8|pc|S2|pc|S6|pc|H3|pc|H6|pc|HA|pc|H4|pc|S7|pc|S3|pc|SJ|pc|D8|pc|DK|pc|D9|pc|C2|pc|D4|pc|H5|pc|H7|pc|S8|pc|H9|pc|SQ|pc|HJ|pc|C4|pc|HT|pc|ST|pc|C7|pc|HQ|pc|C6|pc|C3|pc|CQ|pc|CK|pc|C5|pc|C8|pc|C9|pc|CT|pc|HK|pc|CA|pc|DJ|pc|D7|pc|CJ|'
  },
  scriptedOpening: [
    ['D3', 'D5', 'DT', 'DQ'],
    ['S5', 'SA', 'S4', 'S9'],
    ['D6']
  ],
  contract: { strain: 'S' },
  leader: 'W',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 12 },
  hands: {
    N: { S: ['K', 'J', '4'], H: ['Q', '5', '3'], D: ['A', 'K', '7', '5'], C: ['K', '8', '4'] },
    E: { S: ['9'], H: ['T', '8', '7', '6'], D: ['T', '9', '8', '2'], C: ['J', '9', '6', '5'] },
    S: { S: ['Q', 'T', '8', '7', '5', '2'], H: ['A', '2'], D: ['Q'], C: ['A', 'T', '3', '2'] },
    W: { S: ['A', '6', '3'], H: ['K', 'J', '9', '4'], D: ['J', '6', '4', '3'], C: ['Q', '7'] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  threatCardIds: ['HQ', 'D7', 'CT'],
  rngSeed: 4004
};
