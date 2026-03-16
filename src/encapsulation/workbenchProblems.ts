import type { Problem, Rank, Seat } from '../core';
import { bindStandard } from './binder';
import type { CardId } from '../core';

export type EncapsulationWorkbenchEntry = {
  id: string;
  name: string;
  encapsulation: string;
};

const ENCAPSULATION_WORKBENCH_ENTRIES: EncapsulationWorkbenchEntry[] = [
  { id: 'encap_wa_a_gt_w', name: 'Encap: Wa, a > w', encapsulation: 'Wa, a > w' },
  { id: 'encap_wwc_gt_a_b_w', name: 'Encap: Wwc > a, b, W', encapsulation: 'Wwc > a, b, W' },
  { id: 'encap_wla_wb_gt_b_w', name: "Encap: WLa, WB > b', W -1", encapsulation: "WLa, WB > b', W -1" },
  { id: 'encap_a_wc_gt_wwc_ww', name: 'Encap: a, Wc > Wwc, WW', encapsulation: 'a, Wc > Wwc, WW' }
];

const ENC_WORKBENCH_BY_ID = new Map(ENCAPSULATION_WORKBENCH_ENTRIES.map((entry) => [entry.id, entry] as const));
const CACHED_PROBLEMS_BY_ID = new Map<string, Problem>();

function hashSeed(text: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function toRanks(ranks: string[]): Rank[] {
  return ranks.map((rank) => rank as Rank);
}

function selectLeader(lead: '>' | '<' | '='): Seat {
  if (lead === '<') return 'N';
  return 'S';
}

function toProblem(entry: EncapsulationWorkbenchEntry): Problem {
  const cached = CACHED_PROBLEMS_BY_ID.get(entry.id);
  if (cached) return cached;

  const bound = bindStandard(entry.encapsulation);
  const leader = selectLeader(bound.lead);
  const handSize = bound.metadata.finalHandSize;
  const goal = Math.max(0, handSize + bound.parsed.goalOffset);
  const threatCardIds = [...new Set(bound.threatCards.map((t) => t.cardId as CardId))];

  const problem: Problem = {
    id: entry.id,
    contract: { strain: 'NT' },
    leader,
    userControls: ['N', 'S'],
    goal: { type: 'minTricks', side: 'NS', n: goal },
    hands: {
      N: {
        S: toRanks(bound.hands.N.S),
        H: toRanks(bound.hands.N.H),
        D: toRanks(bound.hands.N.D),
        C: toRanks(bound.hands.N.C)
      },
      E: {
        S: toRanks(bound.hands.E.S),
        H: toRanks(bound.hands.E.H),
        D: toRanks(bound.hands.E.D),
        C: toRanks(bound.hands.E.C)
      },
      S: {
        S: toRanks(bound.hands.S.S),
        H: toRanks(bound.hands.S.H),
        D: toRanks(bound.hands.S.D),
        C: toRanks(bound.hands.S.C)
      },
      W: {
        S: toRanks(bound.hands.W.S),
        H: toRanks(bound.hands.W.H),
        D: toRanks(bound.hands.W.D),
        C: toRanks(bound.hands.W.C)
      }
    },
    policies: {
      E: { kind: 'threatAware' },
      W: { kind: 'threatAware' }
    },
    threatCardIds,
    rngSeed: hashSeed(`${entry.id}|${entry.encapsulation}`)
  };

  CACHED_PROBLEMS_BY_ID.set(entry.id, problem);
  return problem;
}

export function listEncapsulationWorkbenchEntries(): EncapsulationWorkbenchEntry[] {
  return [...ENCAPSULATION_WORKBENCH_ENTRIES];
}

export function loadEncapsulationWorkbenchProblem(id: string): Problem {
  const entry = ENC_WORKBENCH_BY_ID.get(id);
  if (!entry) throw new Error(`Unknown encapsulation workbench problem '${id}'`);
  return toProblem(entry);
}
