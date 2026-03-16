import type { BoundEncapsulation, FourHands, Side, Suit } from './types';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

function handLine(hands: FourHands, side: Side): string {
  const suitParts = SUITS.map((suit) => `${SUIT_SYMBOL[suit]}${hands[side][suit].join('') || '-'}`);
  return `${side}: ${suitParts.join(' ')}`;
}

export function renderDiagram(binding: BoundEncapsulation): string {
  return [
    `Encapsulation: ${binding.parsed.source}`,
    `Lead: ${binding.lead}`,
    `HandSize: ${binding.metadata.finalHandSize}`,
    handLine(binding.hands, 'N'),
    handLine(binding.hands, 'E'),
    handLine(binding.hands, 'S'),
    handLine(binding.hands, 'W')
  ].join('\n');
}
