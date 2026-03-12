import type { CardRole, CardId, Rank, Seat, Suit } from './types';

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
  type: SemanticEventType;
  seat?: Seat;
  card?: CardId;
  suit?: Suit;
  rank?: Rank;
  tags?: SemanticTag[];
  details?: Record<string, unknown>;
};

export interface SemanticEventCollector {
  emit(event: SemanticEvent): void;
  getEvents(): SemanticEvent[];
  clear(): void;
}

export class InMemorySemanticEventCollector implements SemanticEventCollector {
  private readonly events: SemanticEvent[] = [];

  emit(event: SemanticEvent): void {
    this.events.push(event);
  }

  getEvents(): SemanticEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events.length = 0;
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
