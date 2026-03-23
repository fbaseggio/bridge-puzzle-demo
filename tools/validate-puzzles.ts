import { explainPositionInverse } from '../src/encapsulation';
import { init, legalPlays, autoplayUntilUserOrEnd, type CardId, type Problem, type Seat, type Suit } from '../src/core';
import { demoProblems, resolveDemoProblem, type DemoProblem } from '../src/demo/problems';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const SEATS: Seat[] = ['N', 'E', 'S', 'W'];
const VALID_RANKS = new Set(['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']);

type Issue = { level: 'ERROR' | 'WARN' | 'INFO'; message: string };
type ThreatOverride = {
  reason: string;
  allowMissing?: CardId[];
  allowExtra?: CardId[];
};

// Owner-approved threat override exceptions only.
// Do not add entries here without explicit user approval.
const THREAT_OVERRIDE_ALLOWLIST: Record<string, ThreatOverride> = {
  p001: {
    reason: 'Owner-approved threat set omits D2 for this puzzle.',
    allowMissing: ['D2']
  },
  p012: {
    reason: 'Owner-approved threat set keeps DJ as manual threat card.',
    allowExtra: ['DJ']
  },
  gorillas_full_deal: {
    reason: 'Authoritative manual threat choice keeps S2 (not inferred S9).',
    allowMissing: ['S9'],
    allowExtra: ['S2']
  },
  sure_tricks_demo: {
    reason: 'Owner-approved threat set excludes DQ for this sure-tricks variant family.',
    allowMissing: ['DQ']
  }
};

function cardId(suit: Suit, rank: string): CardId {
  return `${suit}${rank}` as CardId;
}

function suggestedCardsByKind(problem: Problem): { threats: CardId[]; resources: CardId[] } {
  const explained = explainPositionInverse({
    hands: problem.hands,
    turn: problem.leader,
    suitOrder: SUITS,
    threatCardIds: problem.threatCardIds
  });
  const threats: CardId[] = [];
  const resources: CardId[] = [];
  for (const suit of explained.suits) {
    const steps = suit.selectedByScorer?.assignmentSteps ?? suit.bindingLabels ?? [];
    for (const step of steps) {
      const m = /^([NS])([AKQJT2-9])->(g'|G'|[abcfgABCFG])(\d+)$/.exec(step);
      if (!m) continue;
      const c = cardId(suit.suit, m[2]);
      const symbol = m[3];
      if (symbol.toLowerCase() === 'f') {
        if (!resources.includes(c)) resources.push(c);
      } else if (!threats.includes(c)) {
        threats.push(c);
      }
    }
  }
  return { threats, resources };
}

function combinedEwCardIds(problem: Problem): CardId[] {
  const cards: CardId[] = [];
  for (const seat of ['E', 'W'] as const) {
    for (const suit of SUITS) {
      for (const rank of problem.hands[seat][suit]) {
        cards.push(cardId(suit, rank));
      }
    }
  }
  return cards.sort();
}

function combinedVariantCardIds(variant: NonNullable<Problem['ewVariants']>[number]): CardId[] {
  const cards: CardId[] = [];
  for (const seat of ['E', 'W'] as const) {
    for (const suit of SUITS) {
      for (const rank of variant.hands[seat][suit]) {
        cards.push(cardId(suit, rank));
      }
    }
  }
  return cards.sort();
}

function validateVariantCardSet(entry: DemoProblem, problem: Problem): Issue[] {
  const variants = problem.ewVariants;
  if (!variants || variants.length <= 1) return [];

  const issues: Issue[] = [];
  const baselineVariant = variants[0];
  const baselineCards = combinedVariantCardIds(baselineVariant);

  for (const variant of variants.slice(1)) {
    const variantCards = combinedVariantCardIds(variant);
    if (variantCards.join(',') !== baselineCards.join(',')) {
      issues.push({
        level: 'ERROR',
        message:
          `Variant E/W card-set mismatch [${variant.id}] expected=[${baselineCards.join(',')}] ` +
          `actual=[${variantCards.join(',')}] baseline=[${baselineVariant.id}]`
      });
    }
  }

  return issues;
}

function pushDeclaredVsInferredIssue(
  issues: Issue[],
  problem: Problem,
  label: 'threat' | 'resource',
  declared: CardId[],
  inferred: CardId[]
): void {
  const missing = inferred.filter((c) => !declared.includes(c));
  const extra = declared.filter((c) => !inferred.includes(c));
  if (missing.length === 0 && extra.length === 0) return;

  const printableLabel = label === 'threat' ? 'Inverse threat suggestion' : 'Inverse resource suggestion';
  if (label === 'threat') {
    const override = THREAT_OVERRIDE_ALLOWLIST[problem.id];
    const missingAllowed = missing.every((c) => (override?.allowMissing ?? []).includes(c));
    const extraAllowed = extra.every((c) => (override?.allowExtra ?? []).includes(c));
    const fullyCoveredByOverride = Boolean(override) && missingAllowed && extraAllowed;
    if (fullyCoveredByOverride) {
      issues.push({
        level: 'INFO',
        message:
          `${printableLabel} [APPROVED-OVERRIDE] declared=[${declared.join(',') || '-'}] ` +
          `inferred=[${inferred.join(',') || '-'}] missing=[${missing.join(',') || '-'}] extra=[${extra.join(',') || '-'}] ` +
          `reason="${override?.reason ?? ''}"`
      });
      return;
    }
  }

  if (problem.status === 'underConstruction') {
    issues.push({
      level: 'INFO',
      message:
        `${printableLabel} [UNDER-CONSTRUCTION] declared=[${declared.join(',') || '-'}] ` +
        `inferred=[${inferred.join(',') || '-'}] missing=[${missing.join(',') || '-'}] extra=[${extra.join(',') || '-'}]`
    });
    return;
  }

  issues.push({
    level: 'WARN',
    message:
      `${printableLabel} [DIFF] declared=[${declared.join(',') || '-'}] inferred=[${inferred.join(',') || '-'}] ` +
      `missing=[${missing.join(',') || '-'}] extra=[${extra.join(',') || '-'}]`
  });
}

function validateProblem(problem: Problem, entry?: DemoProblem): Issue[] {
  const issues: Issue[] = [];

  if (entry) {
    issues.push(...validateVariantCardSet(entry, problem));
  }

  // 1) Structural integrity + equal hand sizes.
  const seen = new Set<string>();
  const countsBySeat = new Map<Seat, number>();
  for (const seat of SEATS) {
    let count = 0;
    for (const suit of SUITS) {
      for (const rank of problem.hands[seat][suit]) {
        count += 1;
        if (!VALID_RANKS.has(rank)) {
          issues.push({ level: 'ERROR', message: `Invalid rank ${seat}:${suit}${rank}` });
          continue;
        }
        const id = `${suit}${rank}`;
        if (seen.has(id)) issues.push({ level: 'ERROR', message: `Duplicate card ${id}` });
        seen.add(id);
      }
    }
    countsBySeat.set(seat, count);
  }
  const uniqueCounts = new Set([...countsBySeat.values()]);
  if (uniqueCounts.size !== 1) {
    issues.push({
      level: 'ERROR',
      message: `Hands not equal size: N=${countsBySeat.get('N')} E=${countsBySeat.get('E')} S=${countsBySeat.get('S')} W=${countsBySeat.get('W')}`
    });
  }

  // 2) Leader / user-control consistency.
  if (!SEATS.includes(problem.leader)) {
    issues.push({ level: 'ERROR', message: `Invalid leader '${problem.leader}'` });
  }
  if (!problem.userControls.includes(problem.leader)) {
    issues.push({
      level: 'INFO',
      message: `Leader ${problem.leader} is auto seat; explicit leader required (present) and policy should exist.`
    });
    if (!problem.policies[problem.leader]) {
      issues.push({ level: 'ERROR', message: `Leader ${problem.leader} has no autoplay policy` });
    }
  }

  // 3) Init + first-turn policy sanity.
  try {
    const state = init(problem);
    const legal = legalPlays(state);
    if (legal.length === 0) {
      issues.push({ level: 'ERROR', message: 'No legal plays at initial state' });
    }
    if (!state.userControls.includes(state.turn)) {
      try {
        const stepped = autoplayUntilUserOrEnd(state);
        if (stepped.events.length === 0) {
          issues.push({ level: 'WARN', message: 'Auto seat on lead but no autoplay events emitted' });
        }
      } catch (err) {
        issues.push({ level: 'ERROR', message: `Autoplay advance failed: ${(err as Error).message}` });
      }
    }
  } catch (err) {
    issues.push({ level: 'ERROR', message: `init() failed: ${(err as Error).message}` });
  }

  // Mandatory inverse threat warning (always emitted).
  const suggested = suggestedCardsByKind(problem);
  const declaredThreats = [...(problem.threatCardIds ?? [])].sort();
  const inferredThreats = [...suggested.threats].sort();
  pushDeclaredVsInferredIssue(issues, problem, 'threat', declaredThreats, inferredThreats);

  const declaredResources = [...(problem.resourceCardIds ?? [])].sort();
  const inferredResources = [...suggested.resources].sort();
  pushDeclaredVsInferredIssue(issues, problem, 'resource', declaredResources, inferredResources);

  return issues;
}

function main(): void {
  const requestedIds = process.argv.slice(2);
  const targets = demoProblems.filter((entry) => requestedIds.length === 0 || requestedIds.includes(entry.id));
  if (targets.length === 0) {
    console.error(`No matching problems for ids: ${requestedIds.join(', ')}`);
    process.exit(1);
  }

  let hasError = false;
  for (const entry of targets) {
    const problem = resolveDemoProblem(entry);
    const issues = validateProblem(problem, entry);
    console.log(`\n== ${problem.id} ==`);
    for (const issue of issues) {
      console.log(`${issue.level}: ${issue.message}`);
      if (issue.level === 'ERROR') hasError = true;
    }
    if (issues.length === 0) console.log('OK');
  }

  process.exit(hasError ? 1 : 0);
}

main();
