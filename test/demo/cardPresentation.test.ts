import { describe, expect, it } from 'vitest';
import { formatCardText, renderCardToken, renderSuitGlyph } from '../../src/demo/cardPresentation';

class FakeClassList {
  private tokens = new Set<string>();

  add(...tokens: string[]): void {
    for (const token of tokens) {
      if (token) this.tokens.add(token);
    }
  }

  contains(token: string): boolean {
    return this.tokens.has(token);
  }

  resetFromClassName(value: string): void {
    this.tokens = new Set(value.split(/\s+/).filter(Boolean));
  }

  toString(): string {
    return [...this.tokens].join(' ');
  }
}

class FakeElement {
  classList = new FakeClassList();
  attributes = new Map<string, string>();
  children: Array<FakeElement | string> = [];
  textContent = '';

  get className(): string {
    return this.classList.toString();
  }

  set className(value: string) {
    this.classList.resetFromClassName(value);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  append(...nodes: Array<FakeElement | string>): void {
    this.children.push(...nodes);
  }
}

class FakeDocument {
  createElement(): FakeElement {
    return new FakeElement();
  }
}

describe('card presentation helpers', () => {
  it('formats compact card text with T by default', () => {
    expect(formatCardText('ST')).toBe('♠T');
    expect(formatCardText('HT', { context: 'played-card' })).toBe('♥T');
  });

  it('allows explicit 10 formatting override', () => {
    expect(formatCardText('DT', { tenDisplay: '10' })).toBe('♦10');
  });

  it('renders suit glyphs with shared classes and aria label', () => {
    const doc = new FakeDocument();
    const suit = renderSuitGlyph('D', { context: 'contract-strain', doc: doc as unknown as Document }) as unknown as FakeElement;

    expect(suit.classList.contains('card-suit')).toBe(true);
    expect(suit.classList.contains('card-suit--D')).toBe(true);
    expect(suit.classList.contains('card-suit--contract-strain')).toBe(true);
    expect(suit.getAttribute('aria-label')).toBe('diamond');
    expect(suit.textContent).toBe('♦');
  });

  it('renders card token with context/mode classes and compact T rank', () => {
    const doc = new FakeDocument();
    const token = renderCardToken('CT', {
      context: 'played-card',
      mode: 'semantic-color',
      semanticClass: 'blue',
      doc: doc as unknown as Document
    }) as unknown as FakeElement;

    expect(token.classList.contains('card-token')).toBe(true);
    expect(token.classList.contains('card-token--played-card')).toBe(true);
    expect(token.classList.contains('card-token--mode-semantic-color')).toBe(true);
    expect(token.classList.contains('card-token--semantic-blue')).toBe(true);
    expect(token.getAttribute('aria-label')).toBe('club T');

    const suit = token.children[0] as FakeElement;
    const rank = token.children[1] as FakeElement;
    expect(suit.classList.contains('card-suit')).toBe(true);
    expect(suit.getAttribute('aria-hidden')).toBe('true');
    expect(rank.classList.contains('card-rank')).toBe(true);
    expect(rank.textContent).toBe('T');
  });
});
