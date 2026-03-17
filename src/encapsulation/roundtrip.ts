import { bindStandard } from './binder';
import { explainPositionInverse, inferPositionEncapsulation } from './positionInverse';
import { parseEncapsulation } from './parser';
import { renderDiagram } from './render';
import type { BoundEncapsulation, CardBinding, LeadSymbol, Side, Suit } from './types';

export type RoundTripNormalization = {
  input: string;
  explicitEncap1: string;
  explicitEncap2: string;
  stable: boolean;
  diagram1: string;
  diagram2: string;
  secondPassError?: string;
  bind1Trace?: string;
  bind2Trace?: string;
  inverseTrace1?: string;
  inverseTrace2?: string;
  traceReport?: string;
};

export type RoundTripOptions = {
  verbose?: boolean;
};

function leadToTurn(lead: LeadSymbol): Side {
  if (lead === '<') return 'N';
  if (lead === '>') return 'S';
  return 'S';
}

function normalizeInput(encap: string): string {
  const trimmed = encap.trim();
  if (/[><=]/.test(trimmed)) return trimmed;
  return `${trimmed} =`;
}

function rankIndex(rank: string): number {
  return ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'].indexOf(rank);
}

function headerFromOrder(order: Suit[]): string {
  return `[${order.map((s) => s.toLowerCase()).join('')}]`;
}

function splitHeaderFromOrder(order: Suit[], leftCount: number, lead: LeadSymbol): string {
  const left = order
    .slice(0, Math.max(0, Math.min(leftCount, order.length)))
    .map((s) => s.toLowerCase())
    .join('');
  const right = order
    .slice(Math.max(0, Math.min(leftCount, order.length)))
    .map((s) => s.toLowerCase())
    .join('');
  return `[${left}|${lead}|${right}]`;
}

function leadSymbolFromLead(lead: LeadSymbol): string {
  if (lead === '<') return '<';
  if (lead === '>') return '>';
  return '=';
}

function sourceTextBySlot(bound: BoundEncapsulation): string[] {
  const bySuit = new Map<Suit, string>();
  for (const suitRec of bound.parsed.suits) {
    if (suitRec.isEmpty) {
      bySuit.set(suitRec.suit, '0');
    } else {
      bySuit.set(suitRec.suit, `${suitRec.pattern}${suitRec.allowIdleFill ? '' : "'"}`);
    }
  }
  return bound.parsed.suitOrder.map((suit) => bySuit.get(suit) ?? '0');
}

function parseLeadFromEncapText(text: string): LeadSymbol {
  const m = text.match(/[><=]/);
  if (!m) return '=';
  return m[0] as LeadSymbol;
}

function bindingLabel(binding?: CardBinding): string {
  if (!binding) return '<missing-binding>';
  const base = `${binding.symbol}${binding.index ?? ''}`;
  if (binding.note === 'low') return `${base}-low`;
  if (binding.note?.startsWith('stop')) return `${base}-${binding.note}`;
  return base;
}

function formatHandsCompact(hands: BoundEncapsulation['hands'], suitOrder: Suit[]): string {
  const seatOrder: Side[] = ['N', 'E', 'S', 'W'];
  const lines: string[] = [];
  for (const seat of seatOrder) {
    const parts = suitOrder.map((suit) => `${suit}${hands[seat][suit].join('') || '-'}`);
    lines.push(`${seat}: ${parts.join(' ')}`);
  }
  return lines.join('\n');
}

function formatPreCompletionBlock(bound: BoundEncapsulation): string {
  const md = bound.metadata;
  const lines: string[] = [];
  lines.push(
    `counts specifiedN=${md.specifiedNorth} specifiedS=${md.specifiedSouth} defaultHandSize=${md.defaultHandSize} finalTarget=${md.finalHandSize}`
  );
  lines.push(
    `preTotals N=${md.preCompletionTotals.N} E=${md.preCompletionTotals.E} S=${md.preCompletionTotals.S} W=${md.preCompletionTotals.W}`
  );
  lines.push(
    `idleNeeded N=${md.idleCardsNeededByHand.N} E=${md.idleCardsNeededByHand.E} S=${md.idleCardsNeededByHand.S} W=${md.idleCardsNeededByHand.W}`
  );
  lines.push(formatHandsCompact(md.preCompletionHands, bound.parsed.suitOrder));
  return lines.join('\n');
}

function formatBindTrace(bound: BoundEncapsulation): string {
  const explained = explainPositionInverse({
    hands: bound.hands,
    turn: leadToTurn(bound.lead),
    suitOrder: bound.parsed.suitOrder,
    threatCardIds: bound.threatCards.map((t) => t.cardId)
  });
  const header = headerFromOrder(bound.parsed.suitOrder);
  const sourceBySlot = sourceTextBySlot(bound);
  const bindingMap = new Map(bound.cardBindings.map((binding) => [`${binding.hand}:${binding.suit}:${binding.rank}`, binding]));
  const seatOrder: Side[] = ['N', 'E', 'S', 'W'];
  const lines: string[] = [];

  for (let slot = 0; slot < bound.parsed.suitOrder.length; slot += 1) {
    const suit = bound.parsed.suitOrder[slot];
    const chosen = explained.suits[slot]?.finalText ?? '{no-fit}';
    lines.push(
      `BIND ${suit} slot=${slot + 1}/${bound.parsed.suitOrder.length} header=${header} source=${sourceBySlot[slot]} chosen=${chosen}`
    );
    for (const seat of seatOrder) {
      const ranks = [...bound.hands[seat][suit]].sort((a, b) => rankIndex(a) - rankIndex(b));
      for (const rank of ranks) {
        const binding = bindingMap.get(`${seat}:${suit}:${rank}`);
        const idleSuffix = binding?.role === 'idleFill' ? ' [idleFill]' : '';
        lines.push(`  ${seat}:${rank} -> ${bindingLabel(binding)}${idleSuffix}`);
      }
    }
  }
  return lines.join('\n');
}

function formatInverseTrace(bound: BoundEncapsulation, sourceEncapText: string): string {
  const explained = explainPositionInverse({
    hands: bound.hands,
    turn: leadToTurn(bound.lead),
    suitOrder: bound.parsed.suitOrder,
    threatCardIds: bound.threatCards.map((t) => t.cardId)
  });
  const sourceBySlot = sourceTextBySlot(bound);
  const sourceLead = parseLeadFromEncapText(sourceEncapText);
  const split = splitHeaderFromOrder(bound.parsed.suitOrder, bound.parsed.northPrimaryCount, sourceLead);
  const lines: string[] = [];
  for (let idx = 0; idx < explained.suits.length; idx += 1) {
    const s = explained.suits[idx];
    const cards = `N:${s.cards.N.join('') || '-'} E:${s.cards.E.join('') || '-'} S:${s.cards.S.join('') || '-'} W:${s.cards.W.join('') || '-'}`;
    lines.push(`INV ${s.suit} slot=${s.slotIndex}/${s.totalSlots} header=${s.header} split=${split}`);
    lines.push(`  source=${sourceBySlot[idx] ?? '0'}`);
    lines.push(`  chosen=${s.finalText}`);
    lines.push(`  cards=${cards}`);
    lines.push(`  primary=${s.chosenPrimary} (preferred=${s.preferredPrimary ?? 'none'})`);
    lines.push(
      `  winners=${s.winners.join(' ') || '-'} structuralLows=${s.structuralLows.join(' ') || '-'} threats=${s.threatCandidates.join(' ') || '-'}`
    );
    lines.push(
      `  stops=${s.stopChecks.map((x) => `${x.seat}${x.rank}[W:${x.westStops ? 'Y' : 'N'} E:${x.eastStops ? 'Y' : 'N'} b${x.backing}]`).join(' ') || '-'}`
    );
    lines.push(
      `  count=${s.countSummary} tieBreak=${s.threatCardTieBreakUsed ? 'threatCardIds' : 'none'} lineageOU=${s.lineageOuResolutionUsed ? 'yes' : 'no'}`
    );
    if (s.candidateScores.length > 1) {
      lines.push('  matches=');
      for (const candidate of s.candidateScores) {
        lines.push(
          `    - ${candidate.text} [primary=${candidate.primary}] score=${candidate.score} residualOpposite=${candidate.residualOpposite}`
        );
      }
    }
    if (s.contenderScores.length > 1) {
      lines.push('  contenders=');
      for (const contender of s.contenderScores) {
        lines.push(
          `    - ${contender.text} [primary=${contender.primary}] score=${contender.score} residualOpposite=${contender.residualOpposite}`
        );
      }
    }
    if (s.selectedByScorer) {
      lines.push(
        `  selectedByScorer=${s.selectedByScorer.text ?? '<none>'} [primary=${s.selectedByScorer.primary ?? 'unknown'}]`
      );
      if (s.selectedByScorer.assignmentSteps && s.selectedByScorer.assignmentSteps.length > 0) {
        lines.push('  assignments=');
        for (const step of s.selectedByScorer.assignmentSteps) {
          lines.push(`    - ${step}`);
        }
      }
    }
  }
  return lines.join('\n');
}

function firstDivergence(explicit1: string, explicit2: string, secondPassError?: string): string {
  if (secondPassError) return `first divergence: second bind failed (${secondPassError})`;
  if (explicit1 === explicit2) return 'first divergence: none (stable)';
  return `first divergence: explicit_1 != explicit_2 (${explicit1} -> ${explicit2})`;
}

function formatRoundTripTrace(payload: {
  input: string;
  normalizedInput: string;
  parsedInput: ReturnType<typeof parseEncapsulation>;
  diagram1: string;
  preCompletionBlock: string;
  bind1Trace: string;
  explicitEncap1: string;
  inverseTrace1: string;
  diagram2: string;
  bind2Trace?: string;
  explicitEncap2: string;
  inverseTrace2?: string;
  stable: boolean;
  secondPassError?: string;
}): string {
  const canonicalHeader = headerFromOrder(payload.parsedInput.suitOrder);
  const splitHeader = splitHeaderFromOrder(
    payload.parsedInput.suitOrder,
    payload.parsedInput.northPrimaryCount,
    payload.parsedInput.lead
  );
  const lines: string[] = [];
  lines.push('STEP 1  INPUT ENCAP');
  lines.push(`ENCAP ${payload.input}`);
  lines.push(`ENCAP(normalized) ${payload.normalizedInput}`);
  lines.push(`SLOTS canonical=${canonicalHeader} split=${splitHeader}`);
  lines.push('');
  lines.push('STEP 2  BIND DIAGRAM');
  lines.push('DIAGRAM');
  lines.push(payload.diagram1);
  lines.push('PRE-COMPLETION');
  lines.push(payload.preCompletionBlock);
  lines.push('BIND TRACE');
  lines.push(payload.bind1Trace);
  lines.push('');
  lines.push('STEP 3  INVERSE SHORT ENCAP');
  lines.push(`ENCAP ${payload.explicitEncap1}`);
  lines.push('');
  lines.push('STEP 4  INVERSE LONG TRACE');
  lines.push('ENCAP DETAIL');
  lines.push(payload.inverseTrace1);
  lines.push('');
  lines.push('STEP 5  REBIND DIAGRAM');
  lines.push('DIAGRAM');
  lines.push(payload.diagram2 || '<none>');
  lines.push('BIND TRACE');
  lines.push(payload.bind2Trace ?? '<none>');
  lines.push('');
  lines.push('STEP 6  RE-INVERSE SHORT ENCAP');
  lines.push(`ENCAP ${payload.explicitEncap2}`);
  if (payload.secondPassError) lines.push(`ENCAP error=${payload.secondPassError}`);
  lines.push('');
  lines.push('STEP 7  RE-INVERSE LONG TRACE');
  lines.push('ENCAP DETAIL');
  lines.push(payload.inverseTrace2 ?? '<none>');
  lines.push('');
  lines.push('STEP 8  ROUNDTRIP RESULT');
  lines.push(`ENCAP stable=${payload.stable ? 'yes' : 'no'}`);
  lines.push(firstDivergence(payload.explicitEncap1, payload.explicitEncap2, payload.secondPassError));
  return lines.join('\n');
}

export function normalizeEncapsulationRoundTrip(encap: string, options: RoundTripOptions = {}): RoundTripNormalization {
  const traceEnabled = options.verbose === true || process.env.DEBUG_ENCAP_TRACE === 'true';
  const normalizedInput = normalizeInput(encap);
  const parsed = parseEncapsulation(normalizedInput);
  const bind1 = bindStandard(parsed);
  const diagram1 = renderDiagram(bind1);
  const bind1Trace = traceEnabled ? formatBindTrace(bind1) : undefined;
  const inverseTrace1 = traceEnabled ? formatInverseTrace(bind1, normalizedInput) : undefined;
  const preCompletionBlock = traceEnabled ? formatPreCompletionBlock(bind1) : undefined;
  const explicitEncap1 = inferPositionEncapsulation({
    hands: bind1.hands,
    turn: leadToTurn(bind1.lead),
    suitOrder: bind1.parsed.suitOrder,
    threatCardIds: bind1.threatCards.map((threat) => threat.cardId)
  });

  let bind2Diagram = '';
  let explicitEncap2 = '';
  let secondPassError: string | undefined;
  let bind2Trace: string | undefined;
  let inverseTrace2: string | undefined;
  let bind2: BoundEncapsulation | undefined;
  try {
    bind2 = bindStandard(explicitEncap1);
    bind2Diagram = renderDiagram(bind2);
    if (traceEnabled) {
      bind2Trace = formatBindTrace(bind2);
      inverseTrace2 = formatInverseTrace(bind2, explicitEncap1);
    }
    explicitEncap2 = inferPositionEncapsulation({
      hands: bind2.hands,
      turn: leadToTurn(bind2.lead),
      suitOrder: bind2.parsed.suitOrder,
      threatCardIds: bind2.threatCards.map((threat) => threat.cardId)
    });
  } catch (error) {
    secondPassError = error instanceof Error ? error.message : String(error);
    explicitEncap2 = `<unbound:${secondPassError}>`;
  }

  return {
    input: encap,
    explicitEncap1,
    explicitEncap2,
    stable: explicitEncap1 === explicitEncap2,
    diagram1,
    diagram2: bind2Diagram,
    secondPassError,
    bind1Trace,
    bind2Trace,
    inverseTrace1,
    inverseTrace2,
    traceReport: traceEnabled
      ? formatRoundTripTrace({
          input: encap,
          normalizedInput,
          parsedInput: parsed,
          diagram1,
          preCompletionBlock: preCompletionBlock ?? '',
          bind1Trace: bind1Trace ?? '',
          explicitEncap1,
          inverseTrace1: inverseTrace1 ?? '',
          diagram2: bind2Diagram,
          bind2Trace,
          explicitEncap2,
          inverseTrace2,
          stable: explicitEncap1 === explicitEncap2,
          secondPassError
        })
      : undefined
  };
}
