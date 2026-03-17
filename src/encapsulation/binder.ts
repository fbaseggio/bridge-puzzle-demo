import type { BindMetadata, BoundEncapsulation, BoundThreatCard, CardBinding, CardBindingRole, FourHands, Hand, ParsedEncapsulation, Side, Suit } from './types';
import { parseEncapsulation } from './parser';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANKS_HIGH_TO_LOW = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const RANKS_LOW_TO_HIGH = [...RANKS_HIGH_TO_LOW].reverse();

function emptyHand(): Hand {
  return { S: [], H: [], D: [], C: [] };
}

function emptyHands(): FourHands {
  return { N: emptyHand(), E: emptyHand(), S: emptyHand(), W: emptyHand() };
}

function cloneHands(hands: FourHands): FourHands {
  return {
    N: { S: [...hands.N.S], H: [...hands.N.H], D: [...hands.N.D], C: [...hands.N.C] },
    E: { S: [...hands.E.S], H: [...hands.E.H], D: [...hands.E.D], C: [...hands.E.C] },
    S: { S: [...hands.S.S], H: [...hands.S.H], D: [...hands.S.D], C: [...hands.S.C] },
    W: { S: [...hands.W.S], H: [...hands.W.H], D: [...hands.W.D], C: [...hands.W.C] }
  };
}

type SuitState = {
  used: Set<string>;
  highIdx: number;
  lowIdx: number;
  threatSuitsByStopper: Record<'E' | 'W', Set<Suit>>;
  hasThreat: boolean;
};

function rankIndex(rank: string): number {
  const idx = RANKS_HIGH_TO_LOW.indexOf(rank);
  return idx >= 0 ? idx : 99;
}

function sortHand(hands: FourHands): void {
  for (const side of ['N', 'E', 'S', 'W'] as const) {
    for (const suit of SUITS) {
      hands[side][suit].sort((a, b) => rankIndex(a) - rankIndex(b));
    }
  }
}

function totalCards(hands: FourHands, side: Side): number {
  return SUITS.reduce((acc, suit) => acc + hands[side][suit].length, 0);
}

function otherPrimary(primary: 'N' | 'S'): 'N' | 'S' {
  return primary === 'N' ? 'S' : 'N';
}

type BindingTag = {
  symbol: string;
  index?: number;
  role: CardBindingRole;
  note?: string;
};

function addCard(
  hands: FourHands,
  suitState: Map<Suit, SuitState>,
  cardBindings: CardBinding[],
  bindingIndex: Map<string, number>,
  side: Side,
  suit: Suit,
  rank: string,
  tag?: BindingTag
): void {
  if (hands[side][suit].includes(rank)) return;
  hands[side][suit].push(rank);
  suitState.get(suit)?.used.add(rank);
  if (!tag) return;
  const key = `${side}:${suit}:${rank}`;
  if (bindingIndex.has(key)) return;
  bindingIndex.set(key, cardBindings.length);
  cardBindings.push({
    suit,
    hand: side,
    rank,
    symbol: tag.symbol,
    index: tag.index,
    role: tag.role,
    note: tag.note
  });
}

function nextHigh(suit: Suit, suitState: Map<Suit, SuitState>): string {
  const st = suitState.get(suit);
  if (!st) throw new Error(`Missing suit state for ${suit}`);
  while (st.highIdx < RANKS_HIGH_TO_LOW.length && st.used.has(RANKS_HIGH_TO_LOW[st.highIdx])) st.highIdx += 1;
  const rank = RANKS_HIGH_TO_LOW[st.highIdx];
  if (!rank) throw new Error(`Out of high ranks for suit ${suit}`);
  st.highIdx += 1;
  st.used.add(rank);
  return rank;
}

function nextLow(suit: Suit, suitState: Map<Suit, SuitState>): string {
  const st = suitState.get(suit);
  if (!st) throw new Error(`Missing suit state for ${suit}`);
  while (st.lowIdx < RANKS_LOW_TO_HIGH.length && st.used.has(RANKS_LOW_TO_HIGH[st.lowIdx])) st.lowIdx += 1;
  const rank = RANKS_LOW_TO_HIGH[st.lowIdx];
  if (!rank) throw new Error(`Out of low ranks for suit ${suit}`);
  st.lowIdx += 1;
  st.used.add(rank);
  return rank;
}

function stopperHands(
  code: 'a' | 'b' | 'c',
  owner: 'N' | 'S',
  _primary: 'N' | 'S',
  _isUpper: boolean
): Array<'E' | 'W'> {
  if (code === 'c') return ['W', 'E'];
  // Stopper side is determined from the actual threat owner side.
  if (owner === 'N') return code === 'a' ? ['W'] : ['E'];
  return code === 'a' ? ['E'] : ['W'];
}

function returnStopper(owner: 'N' | 'S'): 'E' | 'W' {
  return owner === 'N' ? 'W' : 'E';
}

function outgoingStopper(owner: 'N' | 'S'): 'E' | 'W' {
  return owner === 'N' ? 'E' : 'W';
}

function computeSpecifiedCounts(parsed: ParsedEncapsulation): { specifiedNorth: number; specifiedSouth: number } {
  let specifiedNorth = 0;
  let specifiedSouth = 0;

  for (const s of parsed.suits) {
    for (const ch of s.pattern) {
      if (ch === 'o' || ch === 'u') continue;
      if (ch === 'm') {
        if (s.primary === 'N') specifiedSouth += 1;
        else specifiedNorth += 1;
        continue;
      }
      if (s.primary === 'N') specifiedNorth += 1;
      else specifiedSouth += 1;
      if (ch >= 'A' && ch <= 'Z') {
        if (s.primary === 'N') specifiedSouth += 1;
        else specifiedNorth += 1;
      }
    }
  }

  return {
    specifiedNorth: Math.max(0, specifiedNorth),
    specifiedSouth: Math.max(0, specifiedSouth)
  };
}

function fillIdleCards(
  hands: FourHands,
  parsed: ParsedEncapsulation,
  suitState: Map<Suit, SuitState>,
  target: number,
  cardBindings: CardBinding[],
  bindingIndex: Map<string, number>
): void {
  const threatSuits = new Set(parsed.suits.filter((s) => /[abcfgABCFGi]/.test(s.pattern)).map((s) => s.suit));
  const disallowedIdleSuits = new Set(parsed.suits.filter((s) => !s.allowIdleFill).map((s) => s.suit));
  const isIdleAllowed = (suit: Suit): boolean => !disallowedIdleSuits.has(suit);

  function fillEW(side: 'E' | 'W'): void {
    while (totalCards(hands, side) < target) {
      const emptySuits = SUITS.filter((s) => isIdleAllowed(s) && hands[side][s].length === 0);
      if (emptySuits.length > 0) {
        const suit = emptySuits[0];
        addCard(
          hands,
          suitState,
          cardBindings,
          bindingIndex,
          side,
          suit,
          nextHigh(suit, suitState),
          { symbol: 'idle', role: 'idleFill' }
        );
        continue;
      }

      const nonThreat = SUITS.filter((s) => isIdleAllowed(s) && !threatSuits.has(s));
      const stopperPref = SUITS.filter((s) => isIdleAllowed(s) && suitState.get(s)?.threatSuitsByStopper[side].has(s));
      const fallback = SUITS.filter((s) => isIdleAllowed(s));
      if (fallback.length === 0) break;
      const pool = nonThreat.length > 0 ? nonThreat : stopperPref.length > 0 ? stopperPref : fallback;
      const suit = pool[0];
      addCard(
        hands,
        suitState,
        cardBindings,
        bindingIndex,
        side,
        suit,
        nextLow(suit, suitState),
        { symbol: 'idle', role: 'idleFill' }
      );
    }
  }

  function fillNS(side: 'N' | 'S'): void {
    while (totalCards(hands, side) < target) {
      const emptySuits = SUITS.filter(
        (s) => isIdleAllowed(s) && hands[side][s].length === 0 && (hands.E[s].length > 0 || hands.W[s].length > 0)
      );
      const pool = emptySuits.length > 0 ? emptySuits : SUITS.filter((s) => isIdleAllowed(s));
      if (pool.length === 0) break;
      const suit = pool[0];
      addCard(
        hands,
        suitState,
        cardBindings,
        bindingIndex,
        side,
        suit,
        nextLow(suit, suitState),
        { symbol: 'idle', role: 'idleFill' }
      );
    }
  }

  for (const side of ['E', 'W'] as const) fillEW(side);
  for (const side of ['N', 'S'] as const) fillNS(side);
}

function bindParsed(parsed: ParsedEncapsulation): BoundEncapsulation {
  const hands = emptyHands();
  const threatCards: BoundThreatCard[] = [];
  const cardBindings: CardBinding[] = [];
  const bindingIndex = new Map<string, number>();
  const suitState = new Map<Suit, SuitState>();
  for (const suit of SUITS) {
    suitState.set(suit, {
      used: new Set<string>(),
      highIdx: 0,
      lowIdx: 0,
      threatSuitsByStopper: { E: new Set<Suit>(), W: new Set<Suit>() },
      hasThreat: false
    });
  }

  for (const suitRec of parsed.suits) {
    const suit = suitRec.suit;
    const primary = suitRec.primary;
    const opposite = otherPrimary(primary);
    let linksSeen = 0;
    const symbolCounts = new Map<string, number>();
    const nextSymbolIndex = (symbol: string): number => {
      const current = symbolCounts.get(symbol) ?? 0;
      const next = current + 1;
      symbolCounts.set(symbol, next);
      return next;
    };
    const pendingTier2OpponentLows: Array<{ token: 'o' | 'u'; index: number; symbolIndex: number }> = [];
    const winnerBackings: Record<'N' | 'S', number> = { N: 0, S: 0 };

    for (let tokenIndex = 0; tokenIndex < suitRec.pattern.length; tokenIndex += 1) {
      const token = suitRec.pattern[tokenIndex] as string;
      if (token === 'w') {
        const idx = nextSymbolIndex('w');
        addCard(hands, suitState, cardBindings, bindingIndex, primary, suit, nextHigh(suit, suitState), {
          symbol: 'w',
          index: idx,
          role: 'structural'
        });
        winnerBackings[primary] += 1;
        linksSeen += 1;
        continue;
      }
      if (token === 'W') {
        const idx = nextSymbolIndex('W');
        addCard(hands, suitState, cardBindings, bindingIndex, primary, suit, nextHigh(suit, suitState), {
          symbol: 'W',
          index: idx,
          role: 'structural'
        });
        winnerBackings[primary] += 1;
        addCard(hands, suitState, cardBindings, bindingIndex, opposite, suit, nextLow(suit, suitState), {
          symbol: 'W',
          index: idx,
          role: 'structural',
          note: 'low'
        });
        linksSeen += 1;
        continue;
      }
      if (token === 'l') {
        const idx = nextSymbolIndex('l');
        addCard(hands, suitState, cardBindings, bindingIndex, primary, suit, nextLow(suit, suitState), {
          symbol: 'l',
          index: idx,
          role: 'structural'
        });
        linksSeen += 1;
        continue;
      }
      if (token === 'L') {
        const idx = nextSymbolIndex('L');
        addCard(hands, suitState, cardBindings, bindingIndex, primary, suit, nextLow(suit, suitState), {
          symbol: 'L',
          index: idx,
          role: 'structural',
          note: 'low'
        });
        addCard(hands, suitState, cardBindings, bindingIndex, opposite, suit, nextHigh(suit, suitState), {
          symbol: 'L',
          index: idx,
          role: 'structural'
        });
        winnerBackings[opposite] += 1;
        linksSeen += 1;
        continue;
      }
      if (token === 'o' || token === 'u') {
        const idx = nextSymbolIndex(token);
        pendingTier2OpponentLows.push({ token, index: tokenIndex, symbolIndex: idx });
        continue;
      }

      const lower = token.toLowerCase();
      if (!['a', 'b', 'c', 'f', 'g', 'i', 'm'].includes(lower)) continue;
      const st = suitState.get(suit);
      if (st) st.hasThreat = true;

      if (lower === 'i') {
        const idx = nextSymbolIndex('i');
        const owner = token === 'i' ? primary : opposite;
        addCard(hands, suitState, cardBindings, bindingIndex, owner, suit, nextLow(suit, suitState), {
          symbol: 'i',
          index: idx,
          role: 'structural'
        });
        continue;
      }
      if (lower === 'm') {
        const idx = nextSymbolIndex('m');
        addCard(hands, suitState, cardBindings, bindingIndex, opposite, suit, nextLow(suit, suitState), {
          symbol: 'm',
          index: idx,
          role: 'structural'
        });
        continue;
      }

      const isUpper = token === token.toUpperCase();
      const owner = isUpper ? opposite : primary;
      if ((lower === 'f' || lower === 'g') && winnerBackings[owner] < 1) {
        throw new Error(`Token '${token}' in suit ${suit} requires winner backing in ${owner} hand`);
      }
      const threatLen = linksSeen + 1;
      const threatIndex = nextSymbolIndex(token);

      if (isUpper) {
        addCard(hands, suitState, cardBindings, bindingIndex, primary, suit, nextLow(suit, suitState), {
          symbol: token,
          index: threatIndex,
          role: 'structural',
          note: 'low'
        });
      }

      let threatRank = '';
      if (lower === 'f' || lower === 'g') {
        const ret = returnStopper(owner);
        const out = outgoingStopper(owner);
        suitState.get(suit)?.threatSuitsByStopper[ret].add(suit);
        addCard(hands, suitState, cardBindings, bindingIndex, ret, suit, nextHigh(suit, suitState), {
          symbol: token,
          index: threatIndex,
          role: 'stopper',
          note: 'stop1'
        });

        const outNeed = lower === 'g' ? Math.max(0, threatLen - 1) : 0;
        if (outNeed > 0) {
          suitState.get(suit)?.threatSuitsByStopper[out].add(suit);
          addCard(hands, suitState, cardBindings, bindingIndex, out, suit, nextHigh(suit, suitState), {
            symbol: token,
            index: threatIndex,
            role: 'stopper',
            note: 'stop1'
          });
        }

        threatRank = nextHigh(suit, suitState);

        for (let i = 0; i < threatLen - 1; i += 1) {
          addCard(hands, suitState, cardBindings, bindingIndex, ret, suit, nextLow(suit, suitState), {
            symbol: token,
            index: threatIndex,
            role: 'stopper',
            note: `stop${i + 2}`
          });
        }
        for (let i = 0; i < Math.max(0, outNeed - 1); i += 1) {
          addCard(hands, suitState, cardBindings, bindingIndex, out, suit, nextLow(suit, suitState), {
            symbol: token,
            index: threatIndex,
            role: 'stopper',
            note: `stop${i + 2}`
          });
        }
      } else {
        const stoppers = stopperHands(lower as 'a' | 'b' | 'c', owner, primary, isUpper);
        if (stoppers.length === 1) {
          const stopper = stoppers[0];
          suitState.get(suit)?.threatSuitsByStopper[stopper].add(suit);
          for (let i = 0; i < threatLen; i += 1) {
            addCard(hands, suitState, cardBindings, bindingIndex, stopper, suit, nextHigh(suit, suitState), {
              symbol: token,
              index: threatIndex,
              role: 'stopper',
              note: `stop${i + 1}`
            });
          }
        } else if (stoppers.length === 2) {
          // alternating until each stopper has full complement
          for (let i = 0; i < threatLen * 2; i += 1) {
            const stopper = stoppers[i % 2];
            suitState.get(suit)?.threatSuitsByStopper[stopper].add(suit);
            addCard(hands, suitState, cardBindings, bindingIndex, stopper, suit, nextHigh(suit, suitState), {
              symbol: token,
              index: threatIndex,
              role: 'stopper',
              note: `stop${i + 1}`
            });
          }
        }
        threatRank = nextHigh(suit, suitState);
      }

      addCard(hands, suitState, cardBindings, bindingIndex, owner, suit, threatRank, {
        symbol: token,
        index: threatIndex,
        role: 'structural'
      });
      threatCards.push({
        symbol: token as 'a' | 'b' | 'c' | 'f' | 'g' | 'A' | 'B' | 'C' | 'F' | 'G',
        suit,
        seat: owner,
        rank: threatRank,
        cardId: `${suit}${threatRank}`
      });
    }

    // Tier-2 lowest assignments (`o`/`u`) are resolved right-to-left after tier-1 lows.
    pendingTier2OpponentLows
      .sort((a, b) => b.index - a.index)
      .forEach(({ token, symbolIndex }) => {
        const target: 'E' | 'W' =
          primary === 'N'
            ? (token === 'o' ? 'W' : 'E')
            : (token === 'o' ? 'E' : 'W');
        addCard(hands, suitState, cardBindings, bindingIndex, target, suit, nextLow(suit, suitState), {
          symbol: token,
          index: symbolIndex,
          role: 'opponentDirective'
        });
      });
  }

  const counts = computeSpecifiedCounts(parsed);
  const defaultHandSize = Math.max(counts.specifiedNorth, counts.specifiedSouth);

  const target = Math.max(
    defaultHandSize,
    totalCards(hands, 'N'),
    totalCards(hands, 'S'),
    totalCards(hands, 'E'),
    totalCards(hands, 'W')
  );

  const preCompletionHands = cloneHands(hands);
  const preCompletionTotals: Record<Side, number> = {
    N: totalCards(preCompletionHands, 'N'),
    E: totalCards(preCompletionHands, 'E'),
    S: totalCards(preCompletionHands, 'S'),
    W: totalCards(preCompletionHands, 'W')
  };
  const idleCardsNeededByHand: Record<Side, number> = {
    N: Math.max(0, target - preCompletionTotals.N),
    E: Math.max(0, target - preCompletionTotals.E),
    S: Math.max(0, target - preCompletionTotals.S),
    W: Math.max(0, target - preCompletionTotals.W)
  };

  fillIdleCards(hands, parsed, suitState, target, cardBindings, bindingIndex);
  sortHand(hands);

  const metadata: BindMetadata = {
    ...counts,
    defaultHandSize,
    finalHandSize: target,
    preCompletionHands,
    preCompletionTotals,
    idleCardsNeededByHand
  };

  return {
    parsed,
    hands,
    lead: parsed.lead,
    metadata,
    threatCards,
    cardBindings
  };
}

export function bindStandard(input: string | ParsedEncapsulation): BoundEncapsulation {
  const parsed = typeof input === 'string' ? parseEncapsulation(input) : input;
  return bindParsed(parsed);
}

export function computeSpecifiedCardCounts(input: string | ParsedEncapsulation): { specifiedNorth: number; specifiedSouth: number } {
  const parsed = typeof input === 'string' ? parseEncapsulation(input) : input;
  return computeSpecifiedCounts(parsed);
}
