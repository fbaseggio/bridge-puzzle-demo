export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';
export type Seat = 'N' | 'E' | 'S' | 'W';
export type CardId = `${Suit}${Rank}`;
export type CardRole = 'promotedWinner' | 'threat' | 'busy' | 'idle' | 'default';
export type DecisionRecord = {
  index: number;
  seat: 'E' | 'W';
  sig: string;
  chosenCard: CardId;
  chosenClassId: string;
  chosenAltClassId: string;
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
};

export type Hand = {
  S: Rank[];
  H: Rank[];
  D: Rank[];
  C: Rank[];
};

export type Side = 'NS' | 'EW';

export type Contract = {
  strain: Suit | 'NT';
};

export type Play = { seat: Seat; suit: Suit; rank: Rank };
export type Goal = { type: 'minTricks'; side: Side; n: number };
export type Policy = { kind: 'randomLegal' | 'threatAware' };

export type Problem = {
  id: string;
  contract: Contract;
  leader: Seat;
  userControls: Seat[];
  goal: Goal;
  hands: Record<Seat, Hand>;
  policies: Partial<Record<Seat, Policy>>;
  threatCardIds?: CardId[];
  preferredDiscards?: Partial<Record<Seat, CardId | CardId[]>>;
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
  phase: 'awaitUser' | 'auto' | 'end';
  rng: RngState;
  goal: Goal;
  userControls: Seat[];
  policies: Partial<Record<Seat, Policy>>;
  preferredDiscards: Partial<Record<Seat, CardId[]>>;
  preferredDiscardUsed: Partial<Record<Seat, boolean>>;
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
      decisionSig?: string;
      replay?: { action: 'forced' | 'disabled'; index?: number; reason?: 'sig-mismatch' | 'card-not-legal'; card?: CardId };
    }
  | { type: 'illegal'; reason: string }
  | { type: 'trickComplete'; winner: Seat; trick: Play[] }
  | { type: 'handComplete'; success: boolean; tricksWon: { NS: number; EW: number } };

export type StepResult = {
  state: State;
  events: EngineEvent[];
};
