import type { SemanticEvent } from './semanticEvents';
import { ExplanationBuilder, type TeachingFact } from './explanationBuilder';
import type { Suit } from './types';

export interface RawSemanticReducerSnapshot {
  events: SemanticEvent[];
}

export interface SemanticReducer {
  apply(event: SemanticEvent): void;
  snapshot(): unknown;
  reset(): void;
}

export class RawSemanticReducer implements SemanticReducer {
  private readonly events: SemanticEvent[] = [];

  apply(event: SemanticEvent): void {
    this.events.push(event);
  }

  snapshot(): RawSemanticReducerSnapshot {
    return { events: [...this.events] };
  }

  reset(): void {
    this.events.length = 0;
  }
}

export type TeachingEntry = {
  seq: number;
  seat: string;
  card: string;
  summary: string;
  reasons: string[];
  effects: string[];
};

export interface TeachingReducerSnapshot {
  entries: TeachingEntry[];
}

function seatName(seat: string): string {
  if (seat === 'N') return 'North';
  if (seat === 'E') return 'East';
  if (seat === 'S') return 'South';
  if (seat === 'W') return 'West';
  return seat;
}

function prettyCard(card: string): string {
  const suit = card[0];
  const rank = card.slice(1);
  const sym = suit === 'S' ? '♠' : suit === 'H' ? '♥' : suit === 'D' ? '♦' : '♣';
  return `${sym}${rank}`;
}

function cardWithRole(card: string, role: string | undefined): string {
  const shown = prettyCard(card);
  if (role === 'busy') return `busy ${shown}`;
  if (role === 'idle') return `idle ${shown}`;
  if (role === 'semi-idle') return `idle ${shown}`;
  if (role === 'threat') return `${shown} threat`;
  if (role === 'strandedThreat') return `stranded ${shown} threat`;
  if (role === 'promotedWinner') return `promoted ${shown} winner`;
  if (role === 'winner') return `winner ${shown}`;
  return shown;
}

function summarizePlayVerb(fact: TeachingFact, cardText: string, plainCardText: string): string {
  const position = fact.trickPosition ?? 0;
  const iWTT = fact.inevitablyWinningThisTrick === true;
  if (position === 1) {
    if (iWTT && fact.role === 'promotedWinner') return `cashes promoted ${plainCardText}.`;
    return iWTT ? `cashes ${cardText}.` : `leads ${cardText}.`;
  }
  if (position >= 2 && position <= 4) {
    if (iWTT) return `wins with ${cardText}.`;
    if (fact.followsSuit === true) return `follows suit with ${cardText}.`;
    if (fact.followsSuit === false) return `discards ${cardText}.`;
  }
  const bucket = fact.bucket;
  if (bucket === 'preferred') return `discards ${cardText}.`;
  if (bucket?.startsWith('tier1')) return `discards ${cardText}.`;
  if (bucket === 'tier2') return `discards ${cardText}.`;
  if (bucket?.startsWith('tier3') || bucket?.startsWith('tier4')) return `discards ${cardText}.`;
  if (bucket?.startsWith('tier5')) return `discards ${cardText}.`;
  return `plays ${cardText}.`;
}

function parseSummaryBrackets(summary: string): { body: string; bracket: string[] } {
  const m = summary.match(/^(.*?)(?: \[(.*)\])?$/);
  if (!m) return { body: summary, bracket: [] };
  const body = (m[1] ?? summary).trim();
  const bracketRaw = (m[2] ?? '').trim();
  const bracket = bracketRaw.length > 0 ? bracketRaw.split(';').map((p) => p.trim()).filter((p) => p.length > 0) : [];
  return { body, bracket };
}

function appendSummaryBracket(summary: string, part: string): string {
  const clean = part.trim();
  if (!clean) return summary;
  const parsed = parseSummaryBrackets(summary);
  if (!parsed.bracket.includes(clean)) parsed.bracket.push(clean);
  if (parsed.bracket.length === 0) return parsed.body;
  return `${parsed.body} [${parsed.bracket.join('; ')}]`;
}

function appendSummaryEffect(summary: string, effect: string): string {
  const clean = effect.trim();
  if (!clean) return summary;
  const parsed = parseSummaryBrackets(summary);
  const body = parsed.body.endsWith('.') ? parsed.body : `${parsed.body}.`;
  const nextBody = `${body} ${clean}`;
  if (parsed.bracket.length === 0) return nextBody;
  return `${nextBody} [${parsed.bracket.join('; ')}]`;
}

function appendSummaryAlternatives(summary: string, alternatives: string): string {
  const clean = alternatives.trim();
  if (!clean) return summary;
  const parsed = parseSummaryBrackets(summary);
  const bodyNoAlt = parsed.body.replace(/\s\{[^}]+\}\s*$/, '').trim();
  if (bodyNoAlt.endsWith(clean)) return summary;
  const body = `${bodyNoAlt} ${clean}`;
  if (parsed.bracket.length === 0) return body;
  return `${body} [${parsed.bracket.join('; ')}]`;
}

function rewriteAsPlayedThreat(summary: string, card: string): string {
  const parsed = parseSummaryBrackets(summary);
  const actor = parsed.body.split(' ')[0] ?? 'Player';
  const shown = prettyCard(card);
  let body = parsed.body;
  if (parsed.body.includes(' discards ')) body = `${actor} discards ${shown} threat.`;
  else if (parsed.body.includes(' leads ')) body = `${actor} leads ${shown} threat.`;
  else if (parsed.body.includes(' cashes promoted ')) body = parsed.body;
  else if (parsed.body.includes(' cashes ')) body = `${actor} cashes ${shown} threat.`;
  else if (parsed.body.includes(' wins with ')) body = `${actor} wins with ${shown} threat.`;
  if (parsed.bracket.length === 0) return body;
  return `${body} [${parsed.bracket.join('; ')}]`;
}

function rewriteAsCashesPromoted(summary: string, card: string): string {
  const parsed = parseSummaryBrackets(summary);
  const actor = parsed.body.split(' ')[0] ?? 'Player';
  const shown = prettyCard(card);
  const body = `${actor} cashes promoted ${shown}.`;
  if (parsed.bracket.length === 0) return body;
  return `${body} [${parsed.bracket.join('; ')}]`;
}

function rewriteWithPromotionCause(summary: string, promotedCard: string): string {
  const parsed = parseSummaryBrackets(summary);
  const bodyNoAlt = parsed.body.replace(/\s\{[^}]+\}\s*$/, '').trim();
  const shown = prettyCard(promotedCard);
  let base = bodyNoAlt.replace(/\.\s*$/, '');
  base = base.replace(/,\s*\*promoting [^*]+\*\s*$/i, '').trim();
  const body = `${base}, *promoting ${shown}*.`;
  if (parsed.bracket.length === 0) return body;
  return `${body} [${parsed.bracket.join('; ')}]`;
}

function formatReasonBracket(fact: TeachingFact): string | null {
  if (fact.text === 'dd-bound') {
    const lead = 'only DD-accurate';
    const alternatives = fact.alternatives ?? [];
    if (alternatives.length === 0) return lead;
    return `${lead}; {${alternatives.join(' ')}}`;
  }

  if ((fact.legalCount ?? 0) <= 1) return null;
  if (fact.transition === 'all-equivalent') return null;
  return null;
}

function formatAlternativesSuffix(fact: TeachingFact): string | null {
  if (fact.text !== 'alternatives') return null;
  const alternatives = fact.alternatives ?? [];
  if (alternatives.length === 0) return null;
  return `{${alternatives.join(' ')}}`;
}

function formatEffect(fact: TeachingFact): string | null {
  const card = fact.card ? prettyCard(fact.card) : null;
  if (!card) return null;
  if (fact.transition === 'threatRestored') return `${card} threat is restored.`;
  if (fact.transition === 'threatPromoted') return `${card} PROMOTED!`;
  if (fact.transition === 'promotedWinnerRemoved') return null;
  if (fact.transition === 'threatStranded') return `${card} threat is now stranded.`;
  if (fact.transition === 'idleTransition') return `${card} becomes idle.`;
  if (fact.transition === 'newThreat') return `${card} becomes a new threat.`;
  if (fact.transition === 'threatRemoved') return `${card} is no longer a threat.`;
  return null;
}

export class TeachingReducer implements SemanticReducer {
  private readonly entries: TeachingEntry[] = [];
  private readonly builder = new ExplanationBuilder();

  setTrumpSuit(trumpSuit: Suit | null): void {
    this.builder.setTrumpSuit(trumpSuit);
  }

  apply(event: SemanticEvent): void {
    const facts = this.builder.apply(event);
    for (const fact of facts) {
      if (fact.type === 'play' && fact.seat && fact.card) {
        const actor = seatName(fact.seat);
        const shownCard = cardWithRole(fact.card, fact.role);
        const summary =
          fact.source === 'user'
            ? `${actor} ${summarizePlayVerb(fact, prettyCard(fact.card), prettyCard(fact.card))}`
            : `${actor} ${summarizePlayVerb(fact, shownCard, prettyCard(fact.card))}`;
        this.entries.push({
          seq: fact.seq,
          seat: fact.seat,
          card: fact.card,
          summary,
          reasons: [],
          effects: []
        });
        continue;
      }

      if (this.entries.length === 0) continue;
      const currentEntry = this.entries[this.entries.length - 1];

      if (fact.type === 'reason') {
        const alternativesSuffix = formatAlternativesSuffix(fact);
        if (alternativesSuffix) {
          currentEntry.summary = appendSummaryAlternatives(currentEntry.summary, alternativesSuffix);
          continue;
        }
        const bracket = formatReasonBracket(fact);
        if (bracket) {
          currentEntry.summary = appendSummaryBracket(currentEntry.summary, bracket);
        }
        continue;
      }

      if (fact.type === 'effect') {
        const effect = formatEffect(fact);
        if (fact.transition === 'promotedWinnerRemoved' && fact.card === currentEntry.card) {
          currentEntry.summary = rewriteAsCashesPromoted(currentEntry.summary, fact.card);
          continue;
        }
        if (!effect) continue;
        if (fact.transition === 'threatRemoved' && fact.card === currentEntry.card) {
          currentEntry.summary = rewriteAsPlayedThreat(currentEntry.summary, fact.card);
          continue;
        }
        if (fact.transition === 'threatPromoted' && fact.card) {
          currentEntry.summary = rewriteWithPromotionCause(currentEntry.summary, fact.card);
          continue;
        }
        if (fact.transition === 'idleTransition') {
          currentEntry.effects.push(effect);
        } else {
          currentEntry.summary = appendSummaryEffect(currentEntry.summary, effect);
        }
      }
    }
  }

  snapshot(): TeachingReducerSnapshot {
    return {
      entries: this.entries.map((entry) => ({
        ...entry,
        reasons: [...entry.reasons],
        effects: [...entry.effects]
      }))
    };
  }

  reset(): void {
    this.entries.length = 0;
    this.builder.reset();
  }
}

export class CompositeSemanticReducer implements SemanticReducer {
  constructor(private readonly reducers: SemanticReducer[]) {}

  apply(event: SemanticEvent): void {
    for (const reducer of this.reducers) reducer.apply(event);
  }

  snapshot(): unknown {
    return this.reducers.map((reducer) => reducer.snapshot());
  }

  reset(): void {
    for (const reducer of this.reducers) reducer.reset();
  }
}
