import type { SemanticEvent } from './semanticEvents';

export interface SemanticReducerSnapshot {
  events: SemanticEvent[];
}

export interface SemanticReducer {
  apply(event: SemanticEvent): void;
  snapshot(): SemanticReducerSnapshot;
  reset(): void;
}

export class RawSemanticReducer implements SemanticReducer {
  private readonly events: SemanticEvent[] = [];

  apply(event: SemanticEvent): void {
    this.events.push(event);
  }

  snapshot(): SemanticReducerSnapshot {
    return { events: [...this.events] };
  }

  reset(): void {
    this.events.length = 0;
  }
}
