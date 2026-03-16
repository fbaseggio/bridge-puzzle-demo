export type LeadSymbol = '>' | '<' | '=';
export type Side = 'N' | 'S' | 'E' | 'W';
export type Suit = 'S' | 'H' | 'D' | 'C';
export type EncapsulationToken = 'w' | 'W' | 'l' | 'L' | 'a' | 'A' | 'b' | 'B' | 'c' | 'C' | 'i';

export type ParsedSuit = {
  suit: Suit;
  primary: 'N' | 'S';
  pattern: string;
  allowIdleFill: boolean;
};

export type ParsedEncapsulation = {
  source: string;
  lead: LeadSymbol;
  suits: ParsedSuit[];
  northPrimaryCount: number;
  southPrimaryCount: number;
  goalOffset: number;
};

export type Hand = Record<Suit, string[]>;
export type FourHands = Record<Side, Hand>;

export type BindMetadata = {
  specifiedNorth: number;
  specifiedSouth: number;
  defaultHandSize: number;
  finalHandSize: number;
};

export type BoundEncapsulation = {
  parsed: ParsedEncapsulation;
  hands: FourHands;
  lead: LeadSymbol;
  metadata: BindMetadata;
  threatCards: BoundThreatCard[];
};

export type BoundThreatCard = {
  symbol: 'a' | 'b' | 'c' | 'A' | 'B' | 'C';
  suit: Suit;
  seat: 'N' | 'S';
  rank: string;
  cardId: string;
};
