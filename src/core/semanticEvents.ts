import type { CardRole, CardId, Rank, Seat, Suit } from './types';
import type { SemanticReducer } from './semanticReducer';

export type SemanticEventType =
  | 'decision-start'
  | 'decision-evaluated'
  | 'decision-chosen'
  | 'card-played'
  | 'threat-updated'
  | 'classifications-updated';

export type SemanticTag =
  | 'idle'
  | 'busy'
  | 'tier1'
  | 'tier2'
  | 'tier3'
  | 'tier4'
  | 'tier5'
  | 'threat'
  | 'strandedThreat'
  | 'promotedWinner'
  | 'winner'
  | 'loser'
  | 'default';

export type SemanticEvent = {
  seq: number;
  type: SemanticEventType;
  seat?: Seat;
  card?: CardId;
  suit?: Suit;
  rank?: Rank;
  tags?: SemanticTag[];
  details?: Record<string, unknown>;
};

export type SemanticEventInput = {
  type: SemanticEventType;
  seat?: Seat;
  card?: CardId;
  suit?: Suit;
  rank?: Rank;
  tags?: SemanticTag[];
  details?: Record<string, unknown>;
};

export interface SemanticEventCollector {
  emit(event: SemanticEventInput): void;
  getEvents(): SemanticEvent[];
  clear(): void;
}

export class InMemorySemanticEventCollector implements SemanticEventCollector {
  private readonly events: SemanticEvent[] = [];
  private reducer: SemanticReducer | null = null;
  private seq = 0;

  emit(event: SemanticEventInput): void {
    this.seq += 1;
    const enriched: SemanticEvent = { seq: this.seq, ...event };
    this.events.push(enriched);
    this.reducer?.apply(enriched);
  }

  getEvents(): SemanticEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events.length = 0;
    this.seq = 0;
  }

  attachReducer(reducer: SemanticReducer | null): void {
    this.reducer = reducer;
  }
}

export function cardRoleToSemanticTag(role: CardRole | undefined): SemanticTag | undefined {
  if (!role) return undefined;
  if (role === 'default') return 'default';
  if (role === 'busy') return 'busy';
  if (role === 'idle') return 'idle';
  if (role === 'threat') return 'threat';
  if (role === 'strandedThreat') return 'strandedThreat';
  if (role === 'promotedWinner') return 'promotedWinner';
  if (role === 'winner') return 'winner';
  return undefined;
}
