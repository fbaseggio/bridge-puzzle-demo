import { bindStandard, deriveBoundThreatCards, resolveCompanionThreatPolicy, normalizeEncapsulationRoundTrip, parseEncapsulation } from '../src/encapsulation';
import { authoredStructureDifferences } from '../src/encapsulation/structureComparison';
import type { BoundEncapsulation, FourHands, ParsedEncapsulation, Side, Suit } from '../src/encapsulation';

export type Candidate = {
  encapsulation: string;
  title?: string;
  source?: string;
  strain?: Suit | 'NT';
  leader?: 'N' | 'S';
  allowAdditionalThreats?: string;
  omitOriginalComparison?: string;
  includeCompanionThreats?: boolean;
};
export type CookTweak = { id: string; suit: Suit; tokenNumber: number; from: string; to: string; encapsulation: string };
export type DdsRequest = { hands: FourHands; turn: 'N' | 'S'; strain: Suit | 'NT'; goal: number };
export type DdsResult = {
  maxTricksNS: number;
  tricksByOpeningCard: Record<string, number>;
  optimalOpeningCards: string[];
  goalWinningOpeningCards: string[];
  pbn: string;
  version: string;
  allOptimalModeAgrees: boolean;
};
export type DdsSolver = (request: DdsRequest) => DdsResult;
type Analysis = { status: 'pass' | 'fail' | 'inconclusive'; result?: DdsResult; error?: string };
type Binding = {
  bound?: BoundEncapsulation;
  threats?: ReturnType<typeof deriveBoundThreatCards>;
  includeCompanionThreats?: boolean;
  companionThreatDecisionRequired?: boolean;
  errors: string[];
};
export type OnboardingReport = {
  schemaVersion: 1;
  createdAt: string;
  candidate: Candidate;
  leader?: 'N' | 'S';
  strain: Suit | 'NT';
  target?: number;
  original: Binding;
  encapsulation: { differences: string[]; e1?: string; e2?: string; stable?: boolean; error?: string };
  dda: Analysis;
  cooks: Array<CookTweak & Binding & { dda: Analysis }>;
  automatedStatus: 'passed' | 'needs-review' | 'incomplete';
  reviewStatus: 'pending';
};

const SEATS: Side[] = ['N', 'E', 'S', 'W'];
const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const GLYPHS = { S: '♠', H: '♥', D: '♦', C: '♣' };

function serialize(parsed: ParsedEncapsulation): string {
  const slotText = (primary: 'N' | 'S') => parsed.suits.filter((slot) => slot.primary === primary)
    .map((slot) => slot.isEmpty ? '0' : slot.pattern + (slot.allowIdleFill ? '' : "'")).join(', ');
  return `[${parsed.suitOrder.join('').toLowerCase()}] ${slotText('N')} ${parsed.lead} ${slotText('S')}${parsed.goalOffset ? ` ${parsed.goalOffset > 0 ? '+' : ''}${parsed.goalOffset}` : ''}`.trim();
}

/** Each result changes one token of the original, never a previously tweaked input. */
export function generateCookTweaks(encapsulation: string): CookTweak[] {
  const parsed = parseEncapsulation(encapsulation);
  const tweaks: CookTweak[] = [];
  parsed.suits.forEach((slot, suitIndex) => {
    const tokens = [...slot.pattern.matchAll(/[AB]['*]|[gG]'|[A-Za-z0]/g)];
    tokens.forEach((match, tokenIndex) => {
      const from = match[0];
      const to = /^[abAB]$/.test(from) ? (from === from.toUpperCase() ? 'C' : 'c')
        : /^(?:A|B|g|G)'$/.test(from) ? from[0] : undefined;
      if (!to) return;
      const changed: ParsedEncapsulation = {
        ...parsed,
        suits: parsed.suits.map((suit, index) => index === suitIndex
          ? { ...suit, pattern: suit.pattern.slice(0, match.index) + to + suit.pattern.slice(match.index! + from.length) }
          : suit)
      };
      tweaks.push({ id: `${slot.suit}-${tokenIndex + 1}`, suit: slot.suit, tokenNumber: tokenIndex + 1, from, to, encapsulation: serialize(changed) });
    });
  });
  return tweaks;
}

function inspectBinding(input: string, choice?: boolean): Binding {
  try {
    const bound = bindStandard(input);
    const target = bound.metadata.finalHandSize;
    const errors: string[] = [];
    if (!Number.isInteger(target) || target < 1 || target > 13) errors.push(`Invalid hand size: ${target}`);
    const seen = new Set<string>();
    for (const seat of SEATS) {
      const cards = SUITS.flatMap((suit) => bound.hands[seat][suit].map((rank) => `${suit}${rank}`));
      if (cards.length !== target) errors.push(`${seat} has ${cards.length} cards; expected ${target}`);
      if (bound.metadata.idleCardsNeededByHand[seat] < 0) errors.push(`${seat} has ${bound.metadata.idleCardsNeededByHand[seat]} idle cards needed`);
      for (const card of cards) {
        if (seen.has(card)) errors.push(`Duplicate card: ${card}`);
        seen.add(card);
      }
    }
    const includeCompanionThreats = resolveCompanionThreatPolicy(bound, choice);
    return {
      bound, errors, includeCompanionThreats,
      companionThreatDecisionRequired: includeCompanionThreats === undefined,
      threats: includeCompanionThreats === undefined ? undefined
        : deriveBoundThreatCards(bound, includeCompanionThreats).filter((card) => card.symbol.toLowerCase() !== 'f')
    };
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : String(error)] };
  }
}

function analyze(binding: Binding, leader: 'N' | 'S' | undefined, strain: Suit | 'NT', target: number | undefined,
  solver: DdsSolver | undefined, cook: boolean, blocked?: string): Analysis {
  if (blocked || binding.errors.length || !binding.bound || !leader || target === undefined) {
    return { status: 'inconclusive', error: blocked ?? (binding.errors.join('; ') || 'Leader or target is unresolved') };
  }
  if (!solver) return { status: 'inconclusive', error: 'DDA was explicitly skipped' };
  try {
    const result = solver({ hands: binding.bound.hands, turn: leader, strain, goal: target });
    const success = cook ? result.maxTricksNS < target : result.maxTricksNS >= target;
    return { status: success ? 'pass' : 'fail', result };
  } catch (error) {
    return { status: 'inconclusive', error: error instanceof Error ? error.message : String(error) };
  }
}

export function runOnboarding(candidate: Candidate, solver?: DdsSolver): OnboardingReport {
  const original = inspectBinding(candidate.encapsulation, candidate.includeCompanionThreats);
  const report: OnboardingReport = {
    schemaVersion: 1, createdAt: new Date().toISOString(), candidate,
    strain: candidate.strain ?? 'NT', original, encapsulation: { differences: [] },
    dda: { status: 'inconclusive' }, cooks: [], automatedStatus: 'incomplete', reviewStatus: 'pending'
  };
  if (!original.bound) {
    report.dda.error = 'Original binding failed';
    return report;
  }
  const parsed = original.bound.parsed;
  report.leader = parsed.lead === '<' ? 'N' : parsed.lead === '>' ? 'S' : candidate.leader;
  if (candidate.leader && parsed.lead !== '=' && candidate.leader !== report.leader) {
    original.errors.push('Explicit leader conflicts with the encapsulation lead marker');
  }
  if (!report.leader) original.errors.push('For a flexible (=) lead, specify --leader N or --leader S');
  report.target = original.bound.metadata.finalHandSize + parsed.goalOffset;
  if (!Number.isInteger(report.target) || report.target < 0 || report.target > original.bound.metadata.finalHandSize) {
    original.errors.push(`Invalid original trick target: ${report.target}`);
  }
  try {
    if (!report.leader) throw new Error('Choose a leader before running the round trip');
    // Resolve a flexible lead only for this review's inversion; retain the authored input.
    const resolved = { ...parsed, lead: report.leader === 'N' ? '<' as const : '>' as const };
    const roundtrip = normalizeEncapsulationRoundTrip(serialize(resolved));
    report.encapsulation = {
      e1: roundtrip.explicitEncap1, e2: roundtrip.explicitEncap2, stable: roundtrip.stable,
      differences: candidate.omitOriginalComparison ? [] : authoredStructureDifferences(candidate.encapsulation, roundtrip.explicitEncap1, Boolean(candidate.allowAdditionalThreats)),
      error: roundtrip.secondPassError
    };
  } catch (error) {
    report.encapsulation.error = error instanceof Error ? error.message : String(error);
  }
  report.dda = analyze(original, report.leader, report.strain, report.target, solver, false);
  for (const tweak of generateCookTweaks(candidate.encapsulation)) {
    const binding = inspectBinding(tweak.encapsulation, candidate.includeCompanionThreats);
    report.cooks.push({ ...tweak, ...binding, dda: analyze(binding, report.leader, report.strain, report.target, solver, true,
      original.errors.length ? 'Original binding/parameters are invalid' : undefined) });
  }
  const analyses = [report.dda, ...report.cooks.map((cook) => cook.dda)];
  report.automatedStatus = analyses.some((result) => result.status === 'inconclusive') ? 'incomplete'
    : original.companionThreatDecisionRequired || report.cooks.some((cook) => cook.companionThreatDecisionRequired)
      || report.encapsulation.error || report.encapsulation.differences.length || !report.encapsulation.stable || analyses.some((result) => result.status === 'fail')
      ? 'needs-review' : 'passed';
  return report;
}

export function newspaperDiagram(hands: FourHands): string {
  const lines = (seat: Side) => SUITS.map((suit) => `${GLYPHS[suit]} ${hands[seat][suit].join(' ') || '—'}`);
  return [
    '                 North', ...lines('N').map((line) => `                 ${line}`), '',
    'West                              East', ...lines('W').map((line, i) => line.padEnd(34) + lines('E')[i]), '',
    '                 South', ...lines('S').map((line) => `                 ${line}`)
  ].join('\n');
}

function analysisMarkdown(analysis: Analysis, cook = false): string {
  if (!analysis.result) return `**INCONCLUSIVE:** ${analysis.error ?? 'No result'}`;
  const result = analysis.result;
  const display = (card: string) => `${GLYPHS[card[0] as Suit]}${card.slice(1)}`;
  return [
    `**${analysis.status === 'pass' ? 'PASS' : cook ? 'COOK FOUND' : 'TARGET NOT REACHED'}** — maximum N/S tricks: **${result.maxTricksNS}**.`,
    '', `First plays reaching the original target: ${result.goalWinningOpeningCards.map(display).join(', ') || 'none'}.`, '',
    '| First play | Maximum N/S tricks |', '| --- | ---: |',
    ...Object.entries(result.tricksByOpeningCard).map(([card, tricks]) => `| ${display(card)} | ${tricks} |`), '',
    `Solver: endplay ${result.version}; all-optimal mode agrees: ${result.allOptimalModeAgrees}.`, '',
    'PBN (N/E/S/W):', '', '```text', result.pbn, '```'
  ].join('\n');
}

function bindingMarkdown(binding: Binding): string {
  const output = binding.errors.map((error) => `- ${error}`);
  if (!binding.bound) return output.join('\n');
  const b = binding.bound;
  output.push('', '```text', newspaperDiagram(b.hands), '```', '',
    binding.companionThreatDecisionRequired
      ? 'Threat selection PENDING: this secondary squeeze requires an explicit --companion-threats include|omit decision.'
      : `Threats (capital companions ${binding.includeCompanionThreats ? 'included' : 'omitted'}):`,
    ...(binding.threats ?? []).map((card) => `- ${card.seat}: ${GLYPHS[card.suit]}${card.rank} (${card.symbol})`), '',
    '| Hand | Specified | Idle needed | Final |', '| --- | ---: | ---: | ---: |',
    ...SEATS.map((seat) => `| ${seat} | ${b.metadata.preCompletionTotals[seat]} | ${b.metadata.idleCardsNeededByHand[seat]} | ${SUITS.reduce((n, suit) => n + b.hands[seat][suit].length, 0)} |`));
  return output.join('\n');
}

export function renderOnboardingReport(report: OnboardingReport): string {
  const c = report.candidate;
  return [
    `# ${c.title ?? 'Puzzle onboarding review'}`, '',
    `Source: ${c.source ?? 'not specified'}`, `Generated: ${report.createdAt}`, '',
    `Automated checks: **${report.automatedStatus}**. Human review: **pending**. Nothing has been added to a practice set.`, '',
    '## 1. Encapsulation vetting', '', '```text', c.encapsulation, '```', '',
    `Strain: ${report.strain}. Leader: ${report.leader ?? 'unresolved'}. Original trick target: ${report.target ?? 'unresolved'}.`, '',
    bindingMarkdown(report.original), '',
    `Original → E1: ${c.omitOriginalComparison ? `OMITTED by explicit permission: ${c.omitOriginalComparison}` : report.encapsulation.e1 ? report.encapsulation.differences.length ? 'FAIL' : 'PASS' : 'INCONCLUSIVE'}.`,
    ...(c.allowAdditionalThreats ? [`Additional lowercase threats permitted: ${c.allowAdditionalThreats}`] : []),
    '', ...report.encapsulation.differences.map((difference) => `- ${difference}`), '',
    '```text', `E1: ${report.encapsulation.e1 ?? 'unavailable'}`, `E2: ${report.encapsulation.e2 ?? 'unavailable'}`, '```', '',
    `E1 = E2: ${report.encapsulation.stable === undefined ? 'INCONCLUSIVE' : report.encapsulation.stable ? 'PASS' : 'FAIL'}.`,
    ...(report.encapsulation.error ? [`Error: ${report.encapsulation.error}`] : []), '',
    '## 2. Double-dummy analysis', '', '### 2.1 Original deal', '', analysisMarkdown(report.dda), '',
    '### 2.2 Check for cooks', '',
    'Each tweak changes one token of the original independently. Unmodified a/b/A/B become c/c/C/C; A\'/B\'/g\'/G\' lose only their apostrophe. Other compound tokens are left alone. All comparisons use the original trick target.', '',
    ...(report.cooks.length ? report.cooks.flatMap((cook) => [
      `#### ${cook.suit}, token ${cook.tokenNumber}: ${cook.from} → ${cook.to}`, '', '```text', cook.encapsulation, '```', '',
      bindingMarkdown(cook), '', analysisMarkdown(cook.dda, true), ''
    ]) : ['No applicable tweaks.' ]), '',
    'Further onboarding review is still required. These automated checks do not approve or publish the candidate.', ''
  ].join('\n');
}
