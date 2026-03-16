import { describe, expect, it } from 'vitest';
import { bindRandom, bindStandard, prepareRandomBindingInput, type Seat, type Suit } from '../../src/encapsulation';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const SEATS: Seat[] = ['N', 'E', 'S', 'W'];
const RANKS_HIGH_TO_LOW = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

function rankIndex(rank: string): number {
  const idx = RANKS_HIGH_TO_LOW.indexOf(rank);
  return idx >= 0 ? idx : 99;
}

function ordinalSeatPattern(bound: ReturnType<typeof bindStandard>, suit: Suit): Seat[] {
  const cards: Array<{ seat: Seat; rank: string }> = [];
  for (const seat of SEATS) {
    for (const rank of bound.hands[seat][suit]) cards.push({ seat, rank });
  }
  cards.sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank));
  return cards.map((c) => c.seat);
}

describe('random binding', () => {
  it('preserves per-suit card counts and ordinal ownership pattern', () => {
    const input = 'wa, WW > WLc, Wc';
    const options = {
      seed: 777,
      swapNS: false,
      resolveEqualLeadAs: '>' as const,
      suitPermutation: ['S', 'H', 'D', 'C'] as [Suit, Suit, Suit, Suit]
    };
    const prepared = prepareRandomBindingInput(input, options);
    const standard = bindStandard(prepared);
    const random = bindRandom(input, options);

    for (const suit of SUITS) {
      const stdCount = SEATS.reduce((n, seat) => n + standard.hands[seat][suit].length, 0);
      const rndCount = SEATS.reduce((n, seat) => n + random.hands[seat][suit].length, 0);
      expect(rndCount).toBe(stdCount);
      expect(ordinalSeatPattern(random, suit)).toEqual(ordinalSeatPattern(standard, suit));
    }
  });

  it('exports threat cards after random relabeling', () => {
    const random = bindRandom('WLa, WB > b, W', { seed: 42, swapNS: false, suitPermutation: ['S', 'H', 'D', 'C'] });
    expect(random.threatCards.length).toBeGreaterThan(0);
    for (const t of random.threatCards) {
      expect(['a', 'b', 'c', 'A', 'B', 'C']).toContain(t.symbol);
      expect(t.cardId.startsWith(t.suit)).toBe(true);
    }
  });

  it('applies lead resolution and suit permutation', () => {
    const random = bindRandom('wL =', {
      seed: 9,
      swapNS: false,
      resolveEqualLeadAs: '<',
      suitPermutation: ['D', 'S', 'C', 'H']
    });
    expect(random.lead).toBe('<');
    expect(random.parsed.lead).toBe('<');
    expect(random.parsed.suits[0]?.suit).toBe('D');
  });

  it('produces different rank assignments across runs', () => {
    const a = bindRandom('wa, WW > WLc, Wc', { seed: 1001, swapNS: false, suitPermutation: ['S', 'H', 'D', 'C'] });
    const b = bindRandom('wa, WW > WLc, Wc', { seed: 2002, swapNS: false, suitPermutation: ['S', 'H', 'D', 'C'] });
    const aKey = SUITS.map((suit) => `${suit}:${SEATS.map((seat) => `${seat}${a.hands[seat][suit].join('')}`).join('|')}`).join(';');
    const bKey = SUITS.map((suit) => `${suit}:${SEATS.map((seat) => `${seat}${b.hands[seat][suit].join('')}`).join('|')}`).join(';');
    expect(aKey).not.toBe(bKey);
  });
});

