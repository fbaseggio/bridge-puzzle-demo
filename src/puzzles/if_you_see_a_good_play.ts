import type { Problem } from '../core';

export const ifYouSeeAGoodPlayFullDeal: Problem = {
  id: 'if_you_see_a_good_play_full_deal',
  source: {
    title: 'If You See a Good Play...',
    url: 'https://www.bridgebase.com/tools/handviewer.html?bbo=y&lin=pn%7Caitail%2Cpi420%2Cbaseggio%2Crasko179%7Cst%7C%7Cmd%7C3SJ63H8764DJ742C93%2CSQHKJ95DKQT963CT6%2CSAKT975HAQTDA8CK2%2C%7Crh%7C%7Cah%7CBoard%205%7Csv%7Cn%7Cmb%7C2C%7Can%7Cour%20strong%20opening%7Cmb%7C3C%7Cmb%7Cd%21%7Can%7C0-3%7Cmb%7Cp%7Cmb%7C3S%7Cmb%7Cp%7Cmb%7C4S%7Cmb%7Cp%7Cmb%7Cp%7Cmb%7Cp%7Cpc%7CD5%7Cpc%7CD2%7Cpc%7CD9%7Cpc%7CDA%7Cpc%7CSA%7Cpc%7CS4%7Cpc%7CS3%7Cpc%7CSQ%7Cpc%7CCK%7Cpc%7CCA%7Cpc%7CC3%7Cpc%7CC6%7Cpc%7CCQ%7Cpc%7CC9%7Cpc%7CCT%7Cpc%7CC2%7Cpc%7CS8%7Cpc%7CSJ%7Cpc%7CD3%7Cpc%7CS9%7Cpc%7CH4%7Cpc%7CH5%7Cpc%7CHT%7Cpc%7CH3%7Cpc%7CS5%7Cpc%7CS2%7Cpc%7CS6%7Cpc%7CD6%7Cpc%7CH6%7Cpc%7CH9%7Cpc%7CHQ%7Cpc%7CH2%7Cmc%7C10%7C'
  },
  contract: { strain: 'S' },
  leader: 'W',
  userControls: ['N', 'S'],
  goal: { type: 'minTricks', side: 'NS', n: 10 },
  hands: {
    N: { S: ['J', '6', '3'], H: ['8', '7', '6', '4'], D: ['J', '7', '4', '2'], C: ['9', '3'] },
    E: { S: ['Q'], H: ['K', 'J', '9', '5'], D: ['K', 'Q', 'T', '9', '6', '3'], C: ['T', '6'] },
    S: { S: ['A', 'K', 'T', '9', '7', '5'], H: ['A', 'Q', 'T'], D: ['A', '8'], C: ['K', '2'] },
    W: { S: ['8', '4', '2'], H: ['3', '2'], D: ['5'], C: ['A', 'Q', 'J', '8', '7', '5', '4'] }
  },
  policies: {
    E: { kind: 'threatAware' },
    W: { kind: 'threatAware' }
  },
  threatCardIds: ['HT', 'D8'],
  rngSeed: 805
};
