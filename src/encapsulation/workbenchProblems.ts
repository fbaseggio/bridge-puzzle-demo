import type { Problem, Rank, Seat } from '../core';
import { bindRandom } from './random';
import { bindStandard } from './binder';
import { deriveBoundThreatCards, resolveCompanionThreatPolicy } from './threats';
import type { CardId } from '../core';

export type EncapsulationWorkbenchEntry = {
  id: string;
  name: string;
  encapsulation: string;
  bindingMode?: 'standard' | 'random';
  source?: Problem['source'];
  /** Defaults to inclusion for all-tricks goals; secondary squeezes require an explicit choice. */
  includeCompanionThreats?: boolean;
};

const ENCAPSULATION_WORKBENCH_ENTRIES: EncapsulationWorkbenchEntry[] = [
  { id: 'encap_wa_a_gt_w', name: 'Encap: Wa, a > w', includeCompanionThreats: false, encapsulation: 'Wa, a > w' },
  { id: 'encap_wwc_gt_a_b_w', name: 'Encap: Wwc > a, b, W', includeCompanionThreats: false, encapsulation: 'Wwc > a, b, W' },
  // Owner reviewed: secondary squeeze; retain the explicit threats only.
  { id: 'encap_wla_wb_gt_b_w', name: "Encap: WLa, WB > b', W -1", includeCompanionThreats: false, encapsulation: "WLa, WB > b', W -1" },
  { id: 'encap_a_wc_gt_wwc_ww', name: 'Encap: a, Wc > Wwc, WW', includeCompanionThreats: false, encapsulation: 'a, Wc > Wwc, WW' },
  { id: 'encap_la_eq_lb_w', name: 'Encap: La = Lb, W', includeCompanionThreats: false, encapsulation: 'La = Lb, W' },
  { id: 'encap_wa_gt_b_wl', name: 'Encap: Wa > b, WL', includeCompanionThreats: false, encapsulation: 'Wa > b, WL' },
  { id: 'encap_wla_w_eq_b', name: 'Encap: WLa, W = b', includeCompanionThreats: false, encapsulation: 'WLa, W = b' },
  { id: 'encap_a_wc_gt_a_w', name: 'Encap: a, Wc > a, w', includeCompanionThreats: false, encapsulation: 'a, Wc > a, w' },
  { id: 'encap_wa_ww_gt_wlc_wc', name: 'Encap: wa, WW > WLc, Wc', includeCompanionThreats: false, encapsulation: 'wa, WW > WLc, Wc' },
  { id: 'encap_wa_wb_gt_wc_ww', name: 'Encap: Wa, Wb > Wc, Ww', includeCompanionThreats: false, encapsulation: 'Wa, Wb > Wc, Ww' },
  // Owner reviewed: secondary squeeze; omit the capital companion.
  { id: 'encap_wlau_waouou_gt_b_wo', name: 'Encap: WLau, WAuu > b, Wo -1', includeCompanionThreats: false, encapsulation: 'WLau, WAuu > b, Wo -1' },
  { id: 'encap_wg_a_gt_wc_ww', name: "Encap: Wg', c > wc, WW", includeCompanionThreats: false, encapsulation: "Wg', c > wc, WW" },
  { id: 'encap_wwa_ww_gt_wc_wc', name: 'Encap: Wwa, WW > Wc, Wc', includeCompanionThreats: false, encapsulation: 'Wwa, WW > Wc, Wc' },
  { id: 'encap_wa_ww_gt_wlc_wc_b', name: 'Encap: wa, WW > WLc, Wc', includeCompanionThreats: false, encapsulation: 'wa, WW > WLc, Wc' },
  { id: 'encap_wa_ww_alt_gt_wc_wc', name: 'Encap: Wa, Ww > Wc, Wc', includeCompanionThreats: false, encapsulation: 'Wa, Ww > Wc, Wc' },
  { id: 'encap_a_ww_gt_wlc_wc', name: 'Encap: a, Ww > WLc, Wc', includeCompanionThreats: false, encapsulation: 'a, Ww > WLc, Wc' },
  { id: 'encap_wa_ww_gt_wc_wc_b', name: 'Encap: wa, WW > Wc, Wc', includeCompanionThreats: false, encapsulation: 'wa, WW > Wc, Wc' },
  { id: 'encap_wla_wc_gt_wc_ww', name: 'Encap: WLa, Wc > Wc, Ww', includeCompanionThreats: false, encapsulation: 'WLa, Wc > Wc, Ww' },
  { id: 'encap_wa_wlc_gt_wc_ww', name: 'Encap: Wa, WLc > Wc, Ww', includeCompanionThreats: false, encapsulation: 'Wa, WLc > Wc, Ww' },
  { id: 'encap_la_wc_gt_wlc_ww', name: 'Encap: La, Wc > WLc, Ww', includeCompanionThreats: false, encapsulation: 'La, Wc > WLc, Ww' },
  { id: 'encap_a_wlc_gt_wlc_ww', name: 'Encap: a, WLc > WLc, Ww', includeCompanionThreats: false, encapsulation: 'a, WLc > WLc, Ww' },
  { id: 'encap_wwa_wc_gt_wc_ww', name: 'Encap: Wwa, WC > Wc, Ww', encapsulation: 'Wwa, WC > Wc, Ww' },
  { id: 'encap_c_wg_gt_wa_ww', name: 'Encap: c, Wg > wa, WW', includeCompanionThreats: false, encapsulation: 'c, Wg > wa, WW' },
  { id: 'encap_wlg_ww_gt_a_c', name: 'Encap: WLg, WW > a, c', includeCompanionThreats: false, encapsulation: 'WLg, WW > a, c' },
  { id: 'encap_clash_wla_gt_wa_lc_ww', name: 'Encap: wLa > wA, Lc, WW', encapsulation: 'wLa > wA, Lc, WW' },
  { id: 'encap_moon_double_clash_3', name: 'Encap: Wa, Lc > wA, Ww', encapsulation: 'Wa, Lc > wA, Ww', source: { title: 'Moon Double Clash 3' } },
  { id: 'encap_moon_double_clash_5', name: 'Encap: WLa, wB > wc, WL', encapsulation: 'WLa, wB > wc, WL', source: { title: 'Moon Double Clash 5' } },
  { id: 'encap_moon_double_clash_7', name: "Encap: [schd] wa, Ww > wA', Wci", encapsulation: "[schd] wa, Ww > wA', Wci", source: { title: 'Moon Double Clash 7' } },
  { id: 'encap_moon_hex_clash_2', name: 'Type R Clash-B', encapsulation: "[schd] wA' Ww > WLc, c", source: { title: 'Moon hex clash 2' } }
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

export function buildEncapsulationWorkbenchProblem(
  entry: EncapsulationWorkbenchEntry,
  options?: { bindingMode?: 'standard' | 'random'; randomSeed?: number; problemId?: string }
): Problem {
  const bindingMode = options?.bindingMode ?? entry.bindingMode ?? 'standard';
  const problemId = options?.problemId ?? entry.id;
  const bound =
    bindingMode === 'random'
      ? bindRandom(entry.encapsulation, { seed: options?.randomSeed })
      : bindStandard(entry.encapsulation);
  const leader = selectLeader(bound.lead);
  const handSize = bound.metadata.finalHandSize;
  const goal = Math.max(0, handSize + bound.parsed.goalOffset);
  const resourceSymbols = new Set(['f', 'F']);
  const includeCompanions = resolveCompanionThreatPolicy(bound, entry.includeCompanionThreats);
  if (includeCompanions === undefined) {
    throw new Error('Secondary squeeze requires an explicit includeCompanionThreats choice at onboarding');
  }
  const boundThreats = deriveBoundThreatCards(bound, includeCompanions);
  const threatCardIds = [
    ...new Set(boundThreats.filter((t) => !resourceSymbols.has(t.symbol)).map((t) => t.cardId as CardId))
  ];
  const resourceCardIds = [
    ...new Set(bound.threatCards.filter((t) => resourceSymbols.has(t.symbol)).map((t) => t.cardId as CardId))
  ];
  const threatSymbolByCardId: Partial<Record<CardId, string>> = {};
  for (const t of boundThreats) {
    if (resourceSymbols.has(t.symbol)) continue;
    threatSymbolByCardId[t.cardId as CardId] = t.symbol;
  }

  return {
    id: problemId,
    source: entry.source,
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
    resourceCardIds,
    threatSymbolByCardId,
    rngSeed: hashSeed(`${problemId}|${entry.encapsulation}|${bindingMode}|${options?.randomSeed ?? '-'}`)
  };
}

function toProblem(entry: EncapsulationWorkbenchEntry): Problem {
  const cached = CACHED_PROBLEMS_BY_ID.get(entry.id);
  if (cached) return cached;

  const problem = buildEncapsulationWorkbenchProblem(entry, {
    bindingMode: entry.bindingMode ?? 'standard',
    problemId: entry.id
  });
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
