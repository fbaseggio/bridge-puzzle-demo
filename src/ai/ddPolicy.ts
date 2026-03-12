import type { CardId } from '../core/types';
import type { EvaluatePolicyInput } from './evaluatePolicy';

type DdRecord = {
  signature: string;
  optimalMoves: string[];
  legalMoves?: string[];
  moveValues?: Record<string, number>;
  bestValue?: number;
};

export type DdAdvice = {
  optimalMoves: CardId[];
  legalMoves?: CardId[];
  moveValues?: Record<string, number>;
  bestValue?: number;
};

export type DdPolicyTrace = {
  mode: 'strict';
  source: 'runtime';
  problemId: string;
  signature: string;
  baseCandidates: CardId[];
  allowedCandidates: CardId[];
  optimalMoves: CardId[];
  bound: boolean;
  fallback: boolean;
  path: 'intersection' | 'dd-fallback' | 'base-fallback';
};

export type DdDatasetDiagnostics = {
  problemId: string;
  loaded: boolean;
  records: number;
  source: string;
  firstKey?: string;
};

const SUIT_ORDER = ['S', 'H', 'D', 'C'] as const;
const SEAT_ORDER = ['N', 'E', 'S', 'W'] as const;
const RANK_ORDER = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;

const rankStrength: Record<string, number> = Object.fromEntries(RANK_ORDER.map((r, i) => [r, RANK_ORDER.length - i]));

function sortRanksDesc(ranks: string[]): string[] {
  return [...ranks].sort((a, b) => (rankStrength[b] ?? 0) - (rankStrength[a] ?? 0));
}

function normalizeCardIds(cards: string[] | undefined): CardId[] | undefined {
  if (!cards) return undefined;
  return cards.filter((card): card is CardId => typeof card === 'string' && card.length >= 2);
}

function buildIndex(records: DdRecord[]): Map<string, DdAdvice> {
  const out = new Map<string, DdAdvice>();
  for (const record of records) {
    if (!record || typeof record.signature !== 'string') continue;
    const optimalMoves = normalizeCardIds(record.optimalMoves);
    if (!optimalMoves || optimalMoves.length === 0) continue;
    out.set(record.signature, {
      optimalMoves,
      legalMoves: normalizeCardIds(record.legalMoves),
      moveValues: record.moveValues,
      bestValue: typeof record.bestValue === 'number' ? record.bestValue : undefined
    });
  }
  return out;
}

const ddRuntimeDataModules = import.meta.env.SSR
  ? (import.meta.glob('../data/dd/*.json', { eager: true, import: 'default' }) as Record<string, DdRecord[]>)
  : {};
const ddRuntimeDataLoaders = import.meta.glob('../data/dd/*.json', { import: 'default' }) as Record<
  string,
  () => Promise<DdRecord[]>
>;

function problemIdFromDataPath(path: string): string | null {
  const slash = path.lastIndexOf('/');
  const file = slash >= 0 ? path.slice(slash + 1) : path;
  if (!file.endsWith('.json')) return null;
  return file.slice(0, -'.json'.length);
}

const ddByProblem = new Map<string, Map<string, DdAdvice>>();
const ddSourceByProblem = new Map<string, string>();
const ddLoadPromiseByProblem = new Map<string, Promise<boolean>>();
for (const path of Object.keys(ddRuntimeDataLoaders)) {
  const problemId = problemIdFromDataPath(path);
  if (!problemId) continue;
  ddSourceByProblem.set(problemId, `src/data/dd/${problemId}.json`);
}
for (const [path, records] of Object.entries(ddRuntimeDataModules)) {
  const problemId = problemIdFromDataPath(path);
  if (!problemId) continue;
  ddByProblem.set(problemId, buildIndex(records));
  ddSourceByProblem.set(problemId, `src/data/dd/${problemId}.json`);
}

export async function ensureDdDatasetLoaded(problemId: string | undefined): Promise<boolean> {
  if (!problemId) return false;
  if (ddByProblem.has(problemId)) return true;
  const inFlight = ddLoadPromiseByProblem.get(problemId);
  if (inFlight) return inFlight;
  const loaderPath = Object.keys(ddRuntimeDataLoaders).find((path) => problemIdFromDataPath(path) === problemId);
  if (!loaderPath) return false;
  const loader = ddRuntimeDataLoaders[loaderPath];
  if (!loader) return false;
  const loadPromise = loader()
    .then((records) => {
      ddByProblem.set(problemId, buildIndex(records));
      ddSourceByProblem.set(problemId, `src/data/dd/${problemId}.json`);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      ddLoadPromiseByProblem.delete(problemId);
    });
  ddLoadPromiseByProblem.set(problemId, loadPromise);
  return loadPromise;
}

export function buildCanonicalPositionSignature(input: Pick<EvaluatePolicyInput, 'contractStrain' | 'seat' | 'hands' | 'trick'>): string {
  const trickText = input.trick.length > 0 ? input.trick.map((p) => `${p.seat}:${p.suit}${p.rank}`).join(',') : '-';
  const handParts = SEAT_ORDER.map((seat) => {
    const suits = SUIT_ORDER.map((suit) => {
      const ranks = sortRanksDesc(input.hands[seat][suit]).join('');
      return `${suit}:${ranks || '-'}`;
    });
    return `${seat}:${suits.join(';')}`;
  });
  return `trump=${String(input.contractStrain).toUpperCase()}|turn=${input.seat}|trick=${trickText}|hands=${handParts.join('|')}`;
}

export function lookupDdAdvice(problemId: string | undefined, signature: string): DdAdvice | null {
  if (!problemId) return null;
  const bySignature = ddByProblem.get(problemId);
  if (!bySignature) return null;
  return bySignature.get(signature) ?? null;
}

export function getDdDatasetDiagnostics(problemId: string | undefined): DdDatasetDiagnostics {
  const id = problemId ?? '-';
  const bySignature = problemId ? ddByProblem.get(problemId) : undefined;
  const loaded = !!bySignature;
  const records = bySignature?.size ?? 0;
  const source = (problemId && ddSourceByProblem.get(problemId)) ?? 'none';
  const firstKey = bySignature && bySignature.size > 0 ? bySignature.keys().next().value : undefined;
  return { problemId: id, loaded, records, source, firstKey };
}

export function applyStrictDdFilter(
  problemId: string | undefined,
  signature: string,
  baseCandidates: CardId[],
  legalCandidates?: CardId[]
): { candidates: CardId[]; trace?: DdPolicyTrace } {
  const advice = lookupDdAdvice(problemId, signature);
  if (!advice) return { candidates: baseCandidates };

  const allowed = new Set(advice.optimalMoves);
  const intersection = baseCandidates.filter((card) => allowed.has(card));
  if (intersection.length > 0) {
    return {
      candidates: intersection,
      trace: {
        mode: 'strict',
        source: 'runtime',
        problemId: problemId ?? '-',
        signature,
        baseCandidates: [...baseCandidates],
        allowedCandidates: [...intersection],
        optimalMoves: [...advice.optimalMoves],
        bound: true,
        fallback: false,
        path: 'intersection'
      }
    };
  }

  const legalUniverse = legalCandidates ?? baseCandidates;
  const ddLegal = legalUniverse.filter((card) => allowed.has(card));
  if (ddLegal.length > 0) {
    return {
      candidates: ddLegal,
      trace: {
        mode: 'strict',
        source: 'runtime',
        problemId: problemId ?? '-',
        signature,
        baseCandidates: [...baseCandidates],
        allowedCandidates: [...ddLegal],
        optimalMoves: [...advice.optimalMoves],
        bound: true,
        fallback: true,
        path: 'dd-fallback'
      }
    };
  }

  return {
    candidates: [...baseCandidates],
    trace: {
      mode: 'strict',
      source: 'runtime',
      problemId: problemId ?? '-',
      signature,
      baseCandidates: [...baseCandidates],
      allowedCandidates: [...advice.optimalMoves],
      optimalMoves: [...advice.optimalMoves],
      bound: false,
      fallback: true,
      path: 'base-fallback'
    }
  };
}
