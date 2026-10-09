import { describe, expect, it } from 'vitest';
import { apply, getSuitEquivalenceClasses, init, type Hand, type Play, type Seat } from '../../src/core';
import { lowestEquivalentPlay, singletonOrEqualsPlay } from '../../src/demo/forcedAutoplay';

function position(north: Partial<Hand>, trick: Play[] = []) {
  const blank = (): Hand => ({ S: [], H: [], D: [], C: [] });
  const state = init({
    id: 'equals-test', contract: { strain: 'NT' }, leader: 'N',
    userControls: ['N', 'E', 'S', 'W'], goal: { type: 'minTricks', side: 'NS', n: 0 },
    hands: { N: { ...blank(), ...north }, E: blank(), S: blank(), W: blank() },
    policies: {}, rngSeed: 1
  });
  state.trick = trick;
  return state;
}

describe('singletons / equals autoplay', () => {
  it('normalizes the policy’s selected group even when other meaningful choices exist', () => {
    const state = position({ S: ['J', 'T', '9', '8'], H: ['4', '3', '2'] });
    expect(singletonOrEqualsPlay(state)).toBeUndefined();
    expect(lowestEquivalentPlay(state, { seat: 'N', suit: 'S', rank: 'J' }))
      .toEqual({ seat: 'N', suit: 'S', rank: '8' });
    expect(lowestEquivalentPlay(state, { seat: 'N', suit: 'H', rank: '4' }))
      .toEqual({ seat: 'N', suit: 'H', rank: '2' });
  });

  it('never crosses an outstanding rank or overrides a DDS candidate restriction', () => {
    const state = position({ H: ['6', '4'] }, [{ seat: 'W', suit: 'H', rank: '5' }]);
    const six: Play = { seat: 'N', suit: 'H', rank: '6' };
    expect(lowestEquivalentPlay(state, six)).toEqual(six);
    state.trick = [];
    expect(lowestEquivalentPlay(state, six)).toEqual({ seat: 'N', suit: 'H', rank: '4' });
    expect(lowestEquivalentPlay(state, six, [six])).toEqual(six);
  });

  it.each(['43', '654', 'JT98'])('follows with the lowest of %s without choosing another suit', ranks => {
    const state = position({ H: ranks.split('') as Hand['H'], S: ['A'] }, [{ seat: 'W', suit: 'H', rank: 'A' }]);
    expect(singletonOrEqualsPlay(state)).toEqual({ seat: 'N', suit: 'H', rank: ranks.at(-1) });
  });

  it('plays an actual singleton even when it is the last card', () => {
    expect(singletonOrEqualsPlay(position({ H: ['4'] }))).toEqual({ seat: 'N', suit: 'H', rank: '4' });
  });

  it('leads or discards H2 when H432 is the whole remaining hand', () => {
    for (const trick of [[], [{ seat: 'W', suit: 'S', rank: 'A' }]] as Play[][]) {
      expect(singletonOrEqualsPlay(position({ H: ['4', '3', '2'] }, trick)))
        .toEqual({ seat: 'N', suit: 'H', rank: '2' });
    }
  });

  it('does not choose between suits, even if each suit is an equals group', () => {
    const state = position({ S: ['6', '5'], H: ['3', '2'] });
    expect(singletonOrEqualsPlay(state)).toBeUndefined();
    state.trick = [{ seat: 'W', suit: 'C', rank: 'A' }];
    expect(singletonOrEqualsPlay(state)).toBeUndefined();
  });

  it.each(['E', 'S', 'W'] as Seat[])('does not bridge H64 while %s holds H5', seat => {
    const state = position({ H: ['6', '4'] });
    state.hands[seat].H = ['5'];
    expect(singletonOrEqualsPlay(state)).toBeUndefined();
  });

  it('bridges absent ranks, but not ranks on the current trick', () => {
    const state = position({ H: ['6', '4'] });
    expect(singletonOrEqualsPlay(state)).toEqual({ seat: 'N', suit: 'H', rank: '4' });
    state.trick = [{ seat: 'W', suit: 'H', rank: '5' }];
    expect(singletonOrEqualsPlay(state)).toBeUndefined();
    // A five in another suit does not separate H6 and H4.
    state.trick = [{ seat: 'W', suit: 'S', rank: '5' }];
    expect(singletonOrEqualsPlay(state)?.rank).toBe('4');
  });

  it('joins gapped equals only after the intervening card’s trick is complete', () => {
    let state = init({
      id: 'completed-gap', contract: { strain: 'NT' }, leader: 'S',
      userControls: ['N', 'E', 'S', 'W'], goal: { type: 'minTricks', side: 'NS', n: 0 },
      hands: {
        N: { S: ['5'], H: [], D: [], C: ['2', '3'] },
        E: { S: ['6', '4'], H: ['2'], D: [], C: [] },
        S: { S: [], H: ['A'], D: [], C: ['4', '6'] },
        W: { S: [], H: ['3', '4'], D: [], C: ['5'] }
      }, policies: {}, rngSeed: 1
    });
    for (const play of [
      { seat: 'S', suit: 'H', rank: 'A' }, { seat: 'W', suit: 'H', rank: '3' },
      { seat: 'N', suit: 'S', rank: '5' }
    ] as Play[]) state = apply(state, play).state;
    expect(getSuitEquivalenceClasses(state, 'E', 'S')).toEqual([['6'], ['4']]);
    state = apply(state, { seat: 'E', suit: 'H', rank: '2' }).state;
    expect(state.trick).toEqual([]);
    expect(getSuitEquivalenceClasses(state, 'E', 'S')).toEqual([['6', '4']]);
  });

  it('keeps two groups separate and never plays after the hand ends', () => {
    const state = position({ H: ['J', 'T', '6', '5'] });
    state.hands.E.H = ['9'];
    expect(singletonOrEqualsPlay(state)).toBeUndefined();
    state.phase = 'end';
    expect(singletonOrEqualsPlay(state)).toBeUndefined();
  });
});
