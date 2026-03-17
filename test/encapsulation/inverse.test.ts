import { describe, expect, it } from 'vitest';
import { inferSuitAbstraction } from '../../src/encapsulation';

describe('single-suit inverse analyzer', () => {
  it('infers Waou for a matching bound single-suit layout', () => {
    const result = inferSuitAbstraction({
      N: 'AJ',
      E: '3',
      S: '2',
      W: 'KQ4'
    });
    expect(result).toBe('Waou');
  });

  it('returns ambiguous when multiple equal-strength abstractions fit', () => {
    const result = inferSuitAbstraction({
      N: '',
      E: '',
      S: '',
      W: '7'
    });
    expect(typeof result).toBe('object');
    if (typeof result === 'string') throw new Error('Expected ambiguous result');
    expect(result.type).toBe('ambiguous');
    expect(result.candidates.length).toBeGreaterThan(1);
  });

  it('prefers idle vs threat for p001-style diamonds unless threatCardIds flags it', () => {
    const result = inferSuitAbstraction({
      N: '',
      E: 'AKQ',
      S: '2',
      W: ''
    });
    expect(result).toBe('iooo');

    const flagged = inferSuitAbstraction(
      { N: '', E: 'AKQ', S: '2', W: '' },
      { suit: 'D', threatCardIds: ['D2'] }
    );
    expect(typeof flagged).toBe('string');
    if (typeof flagged === 'string') expect(/[abc]/.test(flagged)).toBe(true);
  });

  it('recognizes singleton South A as w', () => {
    const result = inferSuitAbstraction({
      N: '',
      E: '',
      S: 'A',
      W: ''
    });
    expect(result).toBe('w');
  });

  it('recognizes p003 spades as Wc', () => {
    const result = inferSuitAbstraction({
      N: 'A8',
      E: 'QT',
      S: '5',
      W: 'KJ'
    });
    expect(result).toBe('Wc');
  });

  it('rejects count-impossible Wo and prefers Wwo for post-trick p001 spades', () => {
    const result = inferSuitAbstraction({
      N: 'A8',
      E: '',
      S: '5',
      W: 'J'
    });
    expect(result).toBe('Wwo');
  });

  it('rejects 0 when any card is present', () => {
    const result = inferSuitAbstraction({
      N: '',
      E: '',
      S: 'A',
      W: ''
    });
    expect(result).not.toBe('0');
  });

  it('prefers L over extra W for initial p007 spades', () => {
    const result = inferSuitAbstraction({
      N: 'A84',
      E: '6',
      S: 'K5',
      W: 'QT7'
    });
    expect(result).toBe('WLau');
  });

  it('prefers compact Wcuu over expanded W/o/u in initial p007 hearts', () => {
    const result = inferSuitAbstraction({
      N: 'A2',
      E: 'QJT9',
      S: '54',
      W: '76'
    });
    expect(result).toBe('Wcuu');
  });

  it('does not let partner low card force c when primary card is only over-stopped', () => {
    const result = inferSuitAbstraction({
      N: 'K',
      E: 'Q',
      S: '2',
      W: 'A'
    });
    expect(result).toBe('a');
  });

  it('excludes W/L structural lows from threat inflation and prefers WLc', () => {
    const result = inferSuitAbstraction({
      N: 'K2',
      E: 'J97',
      S: 'A63',
      W: 'QT8'
    });
    expect(result).toBe('WLc');
  });

  it('uses winner-first structural lows and preserves residual opponent cards as WLauu', () => {
    const result = inferSuitAbstraction({
      N: 'K2',
      E: 'J97',
      S: 'A63',
      W: 'T8'
    });
    expect(result).toBe('WLauu');
  });
});
