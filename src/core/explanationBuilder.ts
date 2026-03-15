import type { CardId, Rank, Seat, Suit } from './types';
import type { SemanticEvent } from './semanticEvents';

export interface TeachingFact {
  type: 'play' | 'effect' | 'reason';
  seq: number;
  seat?: Seat;
  card?: CardId;
  role?: string;
  transition?: string;
  text?: string;
  alternatives?: CardId[];
  ddBound?: boolean;
  bucket?: string;
  source?: string;
  legalCount?: number;
  trickPosition?: number;
  followsSuit?: boolean;
  ddError?: boolean;
}

type DecisionPending = {
  seat: Seat;
  source?: string;
  chosenBucket?: string;
  bucketCards?: CardId[];
  policyClassByCard?: Record<string, string>;
  legalCount?: number;
  ddError?: boolean;
  ddPolicy?: {
    baseCandidates?: CardId[];
    allowedCandidates?: CardId[];
  };
};

export class ExplanationBuilder {
  private static readonly RANK_VALUE: Record<Rank, number> = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    T: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14
  };

  private pendingByCard = new Map<string, DecisionPending>();
  private decisionStartBySeat = new Map<Seat, { legalCount?: number }>();
  private decisionEvalBySeat = new Map<Seat, { chosenBucket?: string; bucketCards?: CardId[]; policyClassByCard?: Record<string, string> }>();
  private trick: Array<{ seat: Seat; card: CardId; suit: Suit; rank: Rank }> = [];
  private trumpSuit: Suit | null = null;

  setTrumpSuit(trumpSuit: Suit | null): void {
    this.trumpSuit = trumpSuit;
    this.trick = [];
  }

  apply(event: SemanticEvent): TeachingFact[] {
    if (event.type === 'decision-start' && event.seat) {
      const details = (event.details ?? {}) as Record<string, unknown>;
      const legalCount = typeof details.legalCount === 'number' ? details.legalCount : undefined;
      this.decisionStartBySeat.set(event.seat, { legalCount });
      return [];
    }

    if (event.type === 'decision-evaluated' && event.seat) {
      const details = (event.details ?? {}) as Record<string, unknown>;
      const chosenBucket = typeof details.chosenBucket === 'string' ? details.chosenBucket : undefined;
      const bucketCards = Array.isArray(details.bucketCards)
        ? details.bucketCards.filter((x): x is CardId => typeof x === 'string')
        : undefined;
      const policyClassByCardRaw = details.policyClassByCard;
      const policyClassByCard =
        policyClassByCardRaw && typeof policyClassByCardRaw === 'object'
          ? Object.fromEntries(
              Object.entries(policyClassByCardRaw as Record<string, unknown>).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string'
              )
            )
          : undefined;
      this.decisionEvalBySeat.set(event.seat, { chosenBucket, bucketCards, policyClassByCard });
      return [];
    }

    if (event.type === 'decision-chosen' && event.seat && event.card) {
      const details = (event.details ?? {}) as Record<string, unknown>;
      const evalInfo = this.decisionEvalBySeat.get(event.seat);
      const startInfo = this.decisionStartBySeat.get(event.seat);
      const bucket = typeof details.chosenBucket === 'string' ? details.chosenBucket : undefined;
      const source = typeof details.source === 'string' ? details.source : undefined;
      const ddError = details.ddError === true;
      const ddPolicyRaw = details.ddPolicy;
      const ddPolicy =
        ddPolicyRaw && typeof ddPolicyRaw === 'object'
          ? {
              baseCandidates: Array.isArray((ddPolicyRaw as Record<string, unknown>).baseCandidates)
                ? ((ddPolicyRaw as Record<string, unknown>).baseCandidates as unknown[]).filter((x): x is CardId => typeof x === 'string')
                : undefined,
              allowedCandidates: Array.isArray((ddPolicyRaw as Record<string, unknown>).allowedCandidates)
                ? ((ddPolicyRaw as Record<string, unknown>).allowedCandidates as unknown[]).filter((x): x is CardId => typeof x === 'string')
                : undefined
            }
          : undefined;
      this.pendingByCard.set(`${event.seat}:${event.card}`, {
        seat: event.seat,
        source,
        chosenBucket: bucket ?? evalInfo?.chosenBucket,
        bucketCards: evalInfo?.bucketCards,
        policyClassByCard: evalInfo?.policyClassByCard,
        legalCount: startInfo?.legalCount,
        ddError,
        ddPolicy
      });
      this.decisionStartBySeat.delete(event.seat);
      this.decisionEvalBySeat.delete(event.seat);
      return [];
    }

    if (event.type === 'card-played' && event.seat && event.card) {
      const parsed = this.parseCard(event.card);
      if (!parsed) return [];
      const priorTrickLength = this.trick.length;
      const leadSuit = this.trick[0]?.suit;
      const followsSuit = priorTrickLength > 0 ? parsed.suit === leadSuit : false;
      this.trick.push({ seat: event.seat, card: event.card, suit: parsed.suit, rank: parsed.rank });
      const key = `${event.seat}:${event.card}`;
      const pending = this.pendingByCard.get(key);
      this.pendingByCard.delete(key);
      const inevitablyWinningThisTrick = this.computeInevitableWinningForCurrentCard(this.trick, this.trumpSuit, event.card);
      const facts: TeachingFact[] = [
        {
          type: 'play',
          seq: event.seq,
          seat: event.seat,
          card: event.card,
          role: this.roleFromDecision(pending, event.card),
          bucket: pending?.chosenBucket,
          source: pending?.source,
          legalCount: pending?.legalCount,
          ddError: pending?.ddError,
          inevitablyWinningThisTrick,
          trickPosition: priorTrickLength + 1,
          followsSuit
        }
      ];

      if (pending?.source !== 'user' && pending?.chosenBucket) {
        facts.push({
          type: 'reason',
          seq: event.seq,
          seat: event.seat,
          card: event.card,
          transition: this.allCandidateClassesEquivalent(pending) ? 'all-equivalent' : undefined,
          text: this.reasonCodeForBucket(pending.chosenBucket),
          legalCount: pending.legalCount
        });
      }

      const ddFact = this.ddReasonFact(event.seq, event.seat, event.card, pending);
      if (ddFact) facts.push(ddFact);
      const alternativesFact = ddFact ? null : this.alternativesFact(event.seq, event.seat, event.card, pending);
      if (alternativesFact) facts.push(alternativesFact);
      if (this.trick.length === 4) this.trick = [];
      return facts;
    }

    if (event.type === 'classifications-updated') {
      const details = (event.details ?? {}) as Record<string, unknown>;
      const changed = Array.isArray(details.changedRoles) ? details.changedRoles : [];
      const facts: TeachingFact[] = [];
      for (const item of changed) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const card = typeof rec.card === 'string' ? (rec.card as CardId) : null;
        const before = typeof rec.before === 'string' ? rec.before : undefined;
        const after = typeof rec.after === 'string' ? rec.after : undefined;
        if (!card) continue;
        const transition = this.roleTransition(before, after);
        if (!transition) continue;
        facts.push({
          type: 'effect',
          seq: event.seq,
          card,
          transition
        });
      }
      return facts;
    }

    return [];
  }

  reset(): void {
    this.pendingByCard.clear();
    this.decisionStartBySeat.clear();
    this.decisionEvalBySeat.clear();
    this.trick = [];
  }

  private parseCard(card: CardId): { suit: Suit; rank: Rank } | null {
    const suit = card.slice(0, 1) as Suit;
    const rank = card.slice(1) as Rank;
    if (!['S', 'H', 'D', 'C'].includes(suit)) return null;
    if (!(rank in ExplanationBuilder.RANK_VALUE)) return null;
    return { suit, rank };
  }

  private rankValue(rank: Rank): number {
    return ExplanationBuilder.RANK_VALUE[rank];
  }

  private trickWinnerIndex(trick: Array<{ suit: Suit; rank: Rank }>, trumpSuit: Suit | null): number {
    const leadSuit = trick[0]?.suit;
    if (!leadSuit) return 0;
    let winner = 0;
    for (let i = 1; i < trick.length; i += 1) {
      const a = trick[winner];
      const b = trick[i];
      const aTrump = trumpSuit !== null && a.suit === trumpSuit;
      const bTrump = trumpSuit !== null && b.suit === trumpSuit;
      if (aTrump !== bTrump) {
        if (bTrump) winner = i;
        continue;
      }
      const compareSuit = aTrump ? trumpSuit : leadSuit;
      if (b.suit !== compareSuit) continue;
      if (a.suit !== compareSuit || this.rankValue(b.rank) > this.rankValue(a.rank)) winner = i;
    }
    return winner;
  }

  private computeInevitableWinningForCurrentCard(
    trick: Array<{ seat: Seat; card: CardId; suit: Suit; rank: Rank }>,
    trumpSuit: Suit | null,
    card: CardId
  ): boolean {
    if (trick.length === 0) return false;
    const winnerIdx = this.trickWinnerIndex(trick, trumpSuit);
    const winner = trick[winnerIdx];
    if (winner.card !== card) return false;
    const remaining = 4 - trick.length;
    if (remaining <= 0) return true;

    // Conservative trick-local inevitability check using current trick context:
    // if a card can still be beaten by any higher trump/same-suit continuation, keep false.
    if (trumpSuit === null) {
      const leadSuit = trick[0].suit;
      return winner.suit === leadSuit && winner.rank === 'A';
    }
    if (winner.suit === trumpSuit && winner.rank === 'A') {
      return true;
    }
    return false;
  }

  private roleFromDecision(pending: DecisionPending | undefined, card: CardId): string | undefined {
    const cls = pending?.policyClassByCard?.[card];
    if (cls) {
      if (cls.startsWith('strandedThreat')) return 'strandedThreat';
      if (cls.startsWith('promotedWinner')) return 'promotedWinner';
      if (cls.startsWith('threat')) return 'threat';
      if (cls.startsWith('busy:')) return 'busy';
      if (cls.startsWith('idle:')) return 'idle';
      if (cls.startsWith('winner')) return 'winner';
    }
    const bucket = pending?.chosenBucket;
    if (!bucket) return undefined;
    if (bucket.startsWith('tier1') || bucket === 'follow:idle-cheap-win') return 'idle';
    if (bucket === 'tier2') return 'semi-idle';
    if (bucket.startsWith('tier3') || bucket.startsWith('tier4') || bucket === 'follow:busy-protect-threat') return 'busy';
    return undefined;
  }

  private allCandidateClassesEquivalent(pending: DecisionPending): boolean {
    const cards = pending.bucketCards ?? [];
    if (cards.length <= 1) return false;
    const classMap = pending.policyClassByCard;
    if (!classMap) return false;
    const classes = new Set<string>();
    for (const card of cards) {
      const cls = classMap[card];
      if (!cls) return false;
      classes.add(cls);
      if (classes.size > 1) return false;
    }
    return classes.size === 1;
  }

  private reasonCodeForBucket(bucket: string): string {
    if (bucket === 'lead:none') return 'lead-practical';
    if (bucket === 'follow:idle-cheap-win') return 'follow-idle-cheap-win';
    if (bucket === 'follow:busy-protect-threat') return 'follow-busy-protect-threat';
    if (bucket === 'follow:below') return 'follow-below';
    if (bucket === 'follow:above') return 'follow-above';
    if (bucket === 'follow:baseline') return 'follow-baseline';
    if (bucket === 'preferred') return 'preferred-discard';
    if (bucket.startsWith('tier1')) return 'discard-idle';
    if (bucket === 'tier2') return 'discard-semi-idle';
    if (bucket.startsWith('tier3') || bucket.startsWith('tier4')) return 'discard-busy';
    if (bucket.startsWith('tier5')) return 'discard-last-tier';
    return 'generic-choice';
  }

  private ddReasonFact(seq: number, seat: Seat, chosen: CardId, pending: DecisionPending | undefined): TeachingFact | null {
    const base = pending?.ddPolicy?.baseCandidates ?? [];
    const allowed = pending?.ddPolicy?.allowedCandidates ?? [];
    if (base.length === 0 || allowed.length === 0 || base.length <= allowed.length) return null;

    const classMap = pending?.policyClassByCard ?? {};
    const chosenClass = classMap[chosen];
    const allowedSet = new Set<CardId>(allowed);
    const alternatives = base
      .filter((c) => !allowedSet.has(c))
      .filter((c) => c !== chosen && (!chosenClass || classMap[c] !== chosenClass));

    return {
      type: 'reason',
      seq,
      seat,
      card: chosen,
      text: 'dd-bound',
      ddBound: true,
      transition: allowed.length === 1 ? 'only' : 'subset',
      alternatives
    };
  }

  private alternativesFact(seq: number, seat: Seat, chosen: CardId, pending: DecisionPending | undefined): TeachingFact | null {
    const cards = pending?.bucketCards ?? [];
    if (cards.length <= 1) return null;
    const classMap = pending?.policyClassByCard ?? {};
    const chosenClass = classMap[chosen];
    const alternatives = cards.filter((c) => c !== chosen && (!chosenClass || classMap[c] !== chosenClass));
    if (alternatives.length === 0) return null;
    return {
      type: 'reason',
      seq,
      seat,
      card: chosen,
      text: 'alternatives',
      alternatives
    };
  }

  private roleTransition(before: string | undefined, after: string | undefined): string | null {
    if (!before && !after) return null;
    if (before === 'strandedThreat' && after === 'threat') return 'threatRestored';
    if (before === 'threat' && after === 'promotedWinner') return 'threatPromoted';
    if (before === 'promotedWinner' && after !== 'threat' && after !== 'strandedThreat' && after !== 'promotedWinner') {
      return 'promotedWinnerRemoved';
    }
    if (before === 'threat' && after === 'strandedThreat') return 'threatStranded';
    if (before === 'busy' && after === 'idle') return 'idleTransition';
    if ((before === undefined || before === 'default' || before === 'idle' || before === 'busy' || before === 'winner') && after === 'threat') {
      return 'newThreat';
    }
    if ((before === 'threat' || before === 'strandedThreat' || before === 'promotedWinner') && after !== 'threat' && after !== 'strandedThreat' && after !== 'promotedWinner') {
      return 'threatRemoved';
    }
    return null;
  }
}
