import type { Rank, Suit } from '../core';
import type { CardId } from '../ai/threatModel';

export type CardPresentationContext = 'diagram-row' | 'played-card' | 'best-chip' | 'contract-strain' | 'inline-card';
export type CardPresentationMode = 'base' | 'semantic-color' | 'semantic-box' | 'mixed';
export type TenDisplay = 'T' | '10';

type GlyphOptions = {
  context?: CardPresentationContext;
  className?: string;
  decorative?: boolean;
  ariaLabel?: string;
  doc?: Document;
};

type CardTokenOptions = {
  context?: Exclude<CardPresentationContext, 'contract-strain'>;
  mode?: CardPresentationMode;
  semanticClass?: string;
  className?: string;
  ariaLabel?: string;
  tenDisplay?: TenDisplay;
  doc?: Document;
};

type CardTextOptions = {
  context?: Exclude<CardPresentationContext, 'contract-strain'>;
  tenDisplay?: TenDisplay;
  separator?: string;
};

const suitGlyph: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣'
};

const suitLabel: Record<Suit, string> = {
  S: 'spade',
  H: 'heart',
  D: 'diamond',
  C: 'club'
};

function resolveDocument(doc?: Document): Document {
  if (doc) return doc;
  if (typeof document !== 'undefined') return document;
  throw new Error('cardPresentation requires a Document in non-browser environments');
}

function parseCardId(cardId: CardId): { suit: Suit; rank: Rank } {
  const suit = cardId[0] as Suit;
  const rank = cardId.slice(1) as Rank;
  return { suit, rank };
}

function resolveTenDisplay(context: Exclude<CardPresentationContext, 'contract-strain'>, tenDisplay?: TenDisplay): TenDisplay {
  if (tenDisplay) return tenDisplay;
  if (context === 'diagram-row' || context === 'played-card' || context === 'best-chip' || context === 'inline-card') return 'T';
  return 'T';
}

function formatRank(rank: Rank, context: Exclude<CardPresentationContext, 'contract-strain'>, tenDisplay?: TenDisplay): string {
  if (rank !== 'T') return rank;
  return resolveTenDisplay(context, tenDisplay);
}

function addClasses(el: HTMLElement, className?: string): void {
  if (!className) return;
  for (const token of className.split(/\s+/)) {
    if (token) el.classList.add(token);
  }
}

export function renderSuitGlyph(suit: Suit, opts: GlyphOptions = {}): HTMLSpanElement {
  const doc = resolveDocument(opts.doc);
  const suitEl = doc.createElement('span');
  suitEl.className = `card-suit card-suit--${suit}`;
  if (opts.context) suitEl.classList.add(`card-suit--${opts.context}`);
  addClasses(suitEl, opts.className);
  suitEl.textContent = suitGlyph[suit];

  if (opts.decorative) {
    suitEl.setAttribute('aria-hidden', 'true');
  } else {
    suitEl.setAttribute('role', 'img');
    suitEl.setAttribute('aria-label', opts.ariaLabel ?? suitLabel[suit]);
  }

  return suitEl;
}

export function renderCardToken(cardId: CardId, opts: CardTokenOptions = {}): HTMLSpanElement {
  const doc = resolveDocument(opts.doc);
  const context = opts.context ?? 'inline-card';
  const mode = opts.mode ?? 'base';
  const { suit, rank } = parseCardId(cardId);

  const token = doc.createElement('span');
  token.className = `card-token card-token--${context} card-token--mode-${mode}`;
  if (opts.semanticClass) token.classList.add(`card-token--semantic-${opts.semanticClass}`);
  addClasses(token, opts.className);
  token.setAttribute('role', 'img');
  token.setAttribute('aria-label', opts.ariaLabel ?? `${suitLabel[suit]} ${formatRank(rank, context, opts.tenDisplay)}`);

  const suitEl = renderSuitGlyph(suit, { context, decorative: true, doc });
  suitEl.classList.add('card-suit--in-token');

  const rankEl = doc.createElement('span');
  rankEl.className = `card-rank card-rank--${context}`;
  rankEl.textContent = formatRank(rank, context, opts.tenDisplay);

  token.append(suitEl, rankEl);
  return token;
}

export function formatCardText(cardId: CardId, opts: CardTextOptions = {}): string {
  const context = opts.context ?? 'inline-card';
  const separator = opts.separator ?? '';
  const { suit, rank } = parseCardId(cardId);
  return `${suitGlyph[suit]}${separator}${formatRank(rank, context, opts.tenDisplay)}`;
}
