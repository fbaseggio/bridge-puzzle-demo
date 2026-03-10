import type { CardId } from '../core/types';
import type { EvaluatePolicyInput } from './evaluatePolicy';
import p003Records from '../data/dd/p003.json';
import p004Records from '../data/dd/p004.json';

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
  problemId: string;
  signature: string;
  baseCandidates: CardId[];
  allowedCandidates: CardId[];
  bound: boolean;
  fallback: boolean;
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

const ddByProblem = new Map<string, Map<string, DdAdvice>>([
  ['p003', buildIndex(p003Records as DdRecord[])],
  ['p004', buildIndex(p004Records as DdRecord[])]
]);

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

export function applyStrictDdFilter(
  problemId: string | undefined,
  signature: string,
  baseCandidates: CardId[]
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
        problemId: problemId ?? '-',
        signature,
        baseCandidates: [...baseCandidates],
        allowedCandidates: [...intersection],
        bound: true,
        fallback: false
      }
    };
  }

  return {
    candidates: [...baseCandidates],
    trace: {
      mode: 'strict',
      problemId: problemId ?? '-',
      signature,
      baseCandidates: [...baseCandidates],
      allowedCandidates: [...advice.optimalMoves],
      bound: false,
      fallback: true
    }
  };
}
