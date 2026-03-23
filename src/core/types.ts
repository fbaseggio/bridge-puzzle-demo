export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';
export type Seat = 'N' | 'E' | 'S' | 'W';
export type CardId = `${Suit}${Rank}`;
export type CardRole = 'promotedWinner' | 'threat' | 'strandedThreat' | 'resource' | 'busy' | 'idle' | 'winner' | 'default';
export type DecisionRecord = {
  index: number;
  seat: 'E' | 'W';
  nodeKey: string;
  sig: string;
  chosenCard: CardId;
  chosenClassId: string;
  chosenAltClassId: string;
  invEqIdleClasses: string[];
  chosenBucket: string;
  bucketCards: CardId[];
  sameBucketAlternativeClassIds: string[];
  representativeCardByClass: Record<string, CardId>;
};
export type UserPlayRecord = { index: number; seat: 'N' | 'S'; playClassId: string };
export type SuccessfulTranscript = {
  problemId: string;
  seed: number;
  decisions: DecisionRecord[];
  userPlays: UserPlayRecord[];
};
export type ReplayState = {
  enabled: boolean;
  transcript: SuccessfulTranscript | null;
  cursor: number;
  divergenceIndex: number | null;
  forcedCard: CardId | null;
  forcedClassId: string | null;
};

export type Hand = {
  S: Rank[];
  H: Rank[];
  D: Rank[];
  C: Rank[];
};

export type EwVariant = {
  id: string;
  label?: string;
  hands: {
    E: Hand;
    W: Hand;
  };
};

export type EwVariantState = {
  variants: EwVariant[];
  activeVariantIds: string[];
  committedVariantId: string | null;
  representativeVariantId: string;
};

export type Side = 'NS' | 'EW';

export type Contract = {
  strain: Suit | 'NT';
};

export type Play = { seat: Seat; suit: Suit; rank: Rank };
export type Goal = { type: 'minTricks'; side: Side; n: number };
export type GoalStatus = 'live' | 'assuredSuccess' | 'assuredFailure';
export type Policy = { kind: 'randomLegal' | 'threatAware'; ddSource?: 'off' | 'runtime' };
export type ProblemStatus = 'active' | 'underConstruction';

export type Problem = {
  id: string;
  status?: ProblemStatus;
  source?: {
    author?: string;
    title?: string;
    url?: string;
  };
  contract: Contract;
  leader: Seat;
  userControls: Seat[];
  goal: Goal;
  hands: Record<Seat, Hand>;
  policies: Partial<Record<Seat, Policy>>;
  threatCardIds?: CardId[];
  resourceCardIds?: CardId[];
  threatSymbolByCardId?: Partial<Record<CardId, string>>;
  preferredDiscards?: Partial<Record<Seat, CardId | CardId[]>>;
  ewVariants?: EwVariant[];
  representativeEwVariantId?: string;
  rngSeed: number;
};

export type RngState = {
  seed: number;
  counter: number;
};

export type State = {
  id: string;
  contract: Contract;
  trumpSuit: Suit | null;
  threat: {
    threatCardIds: CardId[];
    threatsBySuit: Partial<
      Record<
        Suit,
        {
          suit: Suit;
          threatCardId: CardId;
          threatRank: Rank;
          establishedOwner: Seat;
          active: boolean;
          threatLength: number;
          stopStatus?: 'none' | 'single' | 'double';
          symbol?: string;
        }
      >
    >;
  } | null;
  resource: {
    resourceCardIds: CardId[];
    resourcesBySuit: Partial<
      Record<
        Suit,
        {
          suit: Suit;
          resourceCardId: CardId;
          resourceRank: Rank;
          establishedOwner: Seat;
          active: boolean;
          resourceLength: number;
        }
      >
    >;
  } | null;
  threatLabels: {
    E: { busy: Set<CardId>; idle: Set<CardId> };
    W: { busy: Set<CardId>; idle: Set<CardId> };
  } | null;
  cardRoles: Partial<Record<CardId, CardRole>>;
  hands: Record<Seat, Hand>;
  leader: Seat;
  turn: Seat;
  trick: Play[];
  trickClassIds: string[];
  tricksWon: { NS: number; EW: number };
  goalStatus: GoalStatus;
  phase: 'awaitUser' | 'auto' | 'end';
  rng: RngState;
  goal: Goal;
  userControls: Seat[];
  policies: Partial<Record<Seat, Policy>>;
  preferredDiscards: Partial<Record<Seat, CardId[]>>;
  preferredDiscardUsed: Partial<Record<Seat, boolean>>;
  ewVariantState: EwVariantState | null;
  replay: ReplayState;
};

export type EngineEvent =
  | { type: 'played'; play: Play }
  | {
      type: 'autoplay';
      play: Play;
      preferredDiscard?: {
        preferred: CardId[];
        applied: boolean;
        chosen?: CardId;
        reason: 'applied' | 'not-discard' | 'can-follow-suit' | 'already-used' | 'not-in-hand' | 'not-legal';
      };
      chosenBucket?: string;
      bucketCards?: CardId[];
      policyClassByCard?: Record<string, string>;
      tierBuckets?: Partial<Record<'tier3a' | 'tier3b' | 'tier3c' | 'tier4a' | 'tier4b' | 'tier4c', CardId[]>>;
      ddPolicy?: {
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
      ewVariantTrace?: {
        activeVariantIds: string[];
        perVariant: Array<{
          variantId: string;
          chosenBucket?: string;
          playable: CardId[];
          chosenCardId: CardId | null;
          a: CardId[];
          b: CardId[];
          c: CardId[];
          d: CardId[];
        }>;
        intersection: CardId[];
        arbitration: 'single-variant' | 'intersection' | 'eliminate';
        chosenVariantId?: string;
        chosenCardId: CardId | null;
      };
      decisionSig?: string;
      replay?: {
        action: 'forced' | 'disabled';
        index?: number;
        reason?: 'sig-mismatch' | 'card-not-legal' | 'class-not-legal';
        card?: CardId;
        forcedClassId?: string;
      };
      browserDdBackstop?: {
        source: 'browser-dds';
        legalCandidates: CardId[];
        policyChoice: CardId;
        safeCandidates: CardId[];
        finalChoice: CardId;
        overridden: boolean;
        reason: 'applied' | 'runtime-unavailable' | 'no-safe-match';
      };
    }
  | { type: 'illegal'; reason: string }
  | { type: 'trickComplete'; winner: Seat; trick: Play[] }
  | { type: 'handComplete'; success: boolean; tricksWon: { NS: number; EW: number } };

export type StepResult = {
  state: State;
  events: EngineEvent[];
};
