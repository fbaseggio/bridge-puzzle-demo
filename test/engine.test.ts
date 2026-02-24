import { describe, expect, test } from 'vitest';
import { apply, classInfoForCard, init, legalPlays, type CardId, type Problem, type SuccessfulTranscript } from '../src/core';
import { chooseDiscard, computeDiscardTiers } from '../src/ai/defenderDiscard';
import { computeDefenderLabels, initThreatContext, type DefenderLabels } from '../src/ai/threatModel';
import { hasUntriedAlternatives, triedAltKey } from '../src/demo/playAgain';
import { p001 } from '../src/puzzles/p001';
import { p002 } from '../src/puzzles/p002';

describe('bridge engine v0.1', () => {
  test('follow suit enforcement', () => {
    const problem: Problem = {
      id: 'follow-suit',
      contract: { strain: 'NT' },
      leader: 'N',
      userControls: ['N', 'E'],
      goal: { type: 'minTricks', side: 'NS', n: 1 },
      hands: {
        N: { S: ['A'], H: [], D: [], C: [] },
        E: { S: ['2'], H: ['A'], D: [], C: [] },
        S: { S: [], H: [], D: [], C: [] },
        W: { S: [], H: [], D: [], C: [] }
      },
      policies: {},
      rngSeed: 1
    };

    let state = init(problem);
    state = apply(state, { seat: 'N', suit: 'S', rank: 'A' }).state;
    const eLegal = legalPlays(state);

    expect(eLegal).toEqual([{ seat: 'E', suit: 'S', rank: '2' }]);

    const illegal = apply(state, { seat: 'E', suit: 'H', rank: 'A' });
    expect(illegal.events[0]).toEqual({ type: 'illegal', reason: 'Illegal play E:HA' });
  });

  test('NT trick winner ordering', () => {
    const problem: Problem = {
      id: 'winner-order',
      contract: { strain: 'NT' },
      leader: 'N',
      userControls: ['N', 'E', 'S', 'W'],
      goal: { type: 'minTricks', side: 'NS', n: 1 },
      hands: {
        N: { S: ['9'], H: [], D: [], C: [] },
        E: { S: ['A'], H: [], D: [], C: [] },
        S: { S: ['K'], H: [], D: [], C: [] },
        W: { S: ['2'], H: [], D: [], C: [] }
      },
      policies: {},
      rngSeed: 3
    };

    let state = init(problem);
    state = apply(state, { seat: 'N', suit: 'S', rank: '9' }).state;
    state = apply(state, { seat: 'E', suit: 'S', rank: 'A' }).state;
    state = apply(state, { seat: 'S', suit: 'S', rank: 'K' }).state;
    const result = apply(state, { seat: 'W', suit: 'S', rank: '2' });

    const trickEvent = result.events.find((e) => e.type === 'trickComplete');
    expect(trickEvent && trickEvent.type === 'trickComplete' ? trickEvent.winner : null).toBe('E');
    expect(result.state.tricksWon).toEqual({ NS: 0, EW: 1 });
  });

  test('autoplay deterministic for fixed rngSeed', () => {
    const problem: Problem = {
      id: 'auto-deterministic',
      contract: { strain: 'NT' },
      leader: 'N',
      userControls: ['N'],
      goal: { type: 'minTricks', side: 'NS', n: 0 },
      hands: {
        N: { S: ['A', 'K'], H: [], D: [], C: [] },
        E: { S: ['Q', 'J'], H: [], D: [], C: [] },
        S: { S: ['T', '9'], H: [], D: [], C: [] },
        W: { S: ['8', '7'], H: [], D: [], C: [] }
      },
      policies: {
        E: { kind: 'randomLegal' },
        S: { kind: 'randomLegal' },
        W: { kind: 'randomLegal' }
      },
      rngSeed: 12345
    };

    const run = () => {
      let state = init(problem);
      const events: string[] = [];
      while (state.phase !== 'end') {
        const play = legalPlays(state)[0];
        const result = apply(state, play);
        state = result.state;
        events.push(...result.events.map((e) => JSON.stringify(e)));
      }
      return events;
    };

    expect(run()).toEqual(run());
  });

  test('p001 end-of-hand goal evaluation', () => {
    let state = init(p001);
    const allEvents: string[] = [];

    while (state.phase !== 'end') {
      const nextPlay = legalPlays(state)[0];
      const result = apply(state, nextPlay);
      state = result.state;
      allEvents.push(...result.events.map((e) => JSON.stringify(e)));
    }

    const handComplete = allEvents
      .map((raw) => JSON.parse(raw) as { type: string; success?: boolean })
      .find((e) => e.type === 'handComplete');

    expect(handComplete?.success ?? null).toBe(false);
    expect(state.phase).toBe('end');
  });

  test('trump wins over led suit even against lead ace', () => {
    const problem: Problem = {
      id: 'trump-over-led-ace',
      contract: { strain: 'C' },
      leader: 'N',
      userControls: ['N', 'E', 'S', 'W'],
      goal: { type: 'minTricks', side: 'NS', n: 1 },
      hands: {
        N: { S: ['A'], H: [], D: [], C: [] },
        E: { S: ['2'], H: [], D: [], C: [] },
        S: { S: [], H: [], D: [], C: ['2'] },
        W: { S: ['K'], H: [], D: [], C: [] }
      },
      policies: {},
      rngSeed: 11
    };

    let state = init(problem);
    state = apply(state, { seat: 'N', suit: 'S', rank: 'A' }).state;
    state = apply(state, { seat: 'E', suit: 'S', rank: '2' }).state;
    state = apply(state, { seat: 'S', suit: 'C', rank: '2' }).state;
    const result = apply(state, { seat: 'W', suit: 'S', rank: 'K' });
    const trick = result.events.find((e) => e.type === 'trickComplete');

    expect(trick && trick.type === 'trickComplete' ? trick.winner : null).toBe('S');
    expect(result.state.tricksWon).toEqual({ NS: 1, EW: 0 });
  });

  test('highest trump wins when multiple trumps are played', () => {
    const problem: Problem = {
      id: 'highest-trump',
      contract: { strain: 'C' },
      leader: 'N',
      userControls: ['N', 'E', 'S', 'W'],
      goal: { type: 'minTricks', side: 'NS', n: 1 },
      hands: {
        N: { S: ['A'], H: [], D: [], C: [] },
        E: { S: [], H: [], D: [], C: ['2'] },
        S: { S: [], H: [], D: [], C: ['9'] },
        W: { S: ['K'], H: [], D: [], C: [] }
      },
      policies: {},
      rngSeed: 12
    };

    let state = init(problem);
    state = apply(state, { seat: 'N', suit: 'S', rank: 'A' }).state;
    state = apply(state, { seat: 'E', suit: 'C', rank: '2' }).state;
    state = apply(state, { seat: 'S', suit: 'C', rank: '9' }).state;
    const result = apply(state, { seat: 'W', suit: 'S', rank: 'K' });
    const trick = result.events.find((e) => e.type === 'trickComplete');

    expect(trick && trick.type === 'trickComplete' ? trick.winner : null).toBe('S');
  });

  test('if no trump is played, highest of led suit wins', () => {
    const problem: Problem = {
      id: 'no-trump-played',
      contract: { strain: 'C' },
      leader: 'N',
      userControls: ['N', 'E', 'S', 'W'],
      goal: { type: 'minTricks', side: 'EW', n: 1 },
      hands: {
        N: { S: [], H: ['9'], D: [], C: [] },
        E: { S: [], H: ['K'], D: [], C: [] },
        S: { S: [], H: ['2'], D: [], C: [] },
        W: { S: ['A'], H: [], D: [], C: [] }
      },
      policies: {},
      rngSeed: 13
    };

    let state = init(problem);
    state = apply(state, { seat: 'N', suit: 'H', rank: '9' }).state;
    state = apply(state, { seat: 'E', suit: 'H', rank: 'K' }).state;
    state = apply(state, { seat: 'S', suit: 'H', rank: '2' }).state;
    const result = apply(state, { seat: 'W', suit: 'S', rank: 'A' });
    const trick = result.events.find((e) => e.type === 'trickComplete');

    expect(trick && trick.type === 'trickComplete' ? trick.winner : null).toBe('E');
  });

  test('follow suit legality remains unchanged under trump', () => {
    const problem: Problem = {
      id: 'follow-suit-trump',
      contract: { strain: 'C' },
      leader: 'N',
      userControls: ['N', 'E'],
      goal: { type: 'minTricks', side: 'NS', n: 0 },
      hands: {
        N: { S: [], H: [], D: ['A'], C: [] },
        E: { S: [], H: [], D: ['3'], C: ['2'] },
        S: { S: [], H: [], D: [], C: [] },
        W: { S: [], H: [], D: [], C: [] }
      },
      policies: {},
      rngSeed: 14
    };

    let state = init(problem);
    state = apply(state, { seat: 'N', suit: 'D', rank: 'A' }).state;
    expect(legalPlays(state)).toEqual([{ seat: 'E', suit: 'D', rank: '3' }]);
  });

  test('multi-trick progression with trump and next-leader updates', () => {
    const problem: Problem = {
      id: 'trump-progression',
      contract: { strain: 'C' },
      leader: 'N',
      userControls: ['N', 'E', 'S', 'W'],
      goal: { type: 'minTricks', side: 'NS', n: 1 },
      hands: {
        N: { S: ['A'], H: ['2'], D: [], C: [] },
        E: { S: ['K'], H: ['A'], D: [], C: [] },
        S: { S: [], H: ['3'], D: [], C: ['2'] },
        W: { S: ['Q'], H: ['K'], D: [], C: [] }
      },
      policies: {},
      rngSeed: 15
    };

    let state = init(problem);
    state = apply(state, { seat: 'N', suit: 'S', rank: 'A' }).state;
    state = apply(state, { seat: 'E', suit: 'S', rank: 'K' }).state;
    state = apply(state, { seat: 'S', suit: 'C', rank: '2' }).state;
    const trick1 = apply(state, { seat: 'W', suit: 'S', rank: 'Q' });

    const t1Event = trick1.events.find((e) => e.type === 'trickComplete');
    expect(t1Event && t1Event.type === 'trickComplete' ? t1Event.winner : null).toBe('S');
    expect(trick1.state.leader).toBe('S');
    expect(trick1.state.turn).toBe('S');

    state = trick1.state;
    state = apply(state, { seat: 'S', suit: 'H', rank: '3' }).state;
    state = apply(state, { seat: 'W', suit: 'H', rank: 'K' }).state;
    state = apply(state, { seat: 'N', suit: 'H', rank: '2' }).state;
    const trick2 = apply(state, { seat: 'E', suit: 'H', rank: 'A' });
    const t2Event = trick2.events.find((e) => e.type === 'trickComplete');

    expect(t2Event && t2Event.type === 'trickComplete' ? t2Event.winner : null).toBe('E');
    expect(trick2.state.tricksWon).toEqual({ NS: 1, EW: 1 });
    expect(trick2.state.phase).toBe('end');
  });

  test('p001 first W discard tiers and deterministic chosen card under seed=101', () => {
    const start = init(p001);
    const ctx = initThreatContext({ hands: start.hands }, p001.threatCardIds);
    const labels = computeDefenderLabels(ctx, { hands: start.hands });

    const tiers = computeDiscardTiers('W', { hands: start.hands }, 'C', ctx, labels);
    expect(tiers.tier1a).toEqual([]);
    expect(tiers.tier1b).toEqual([]);
    expect(tiers.tier1c).toEqual([]);
    expect(tiers.tier2a).toEqual([]);
    expect(tiers.tier2b).toEqual([]);
    expect(tiers.tier3a).toEqual([]);
    expect(tiers.tier3b.sort()).toEqual(['HA', 'SJ', 'SK']);
    expect(tiers.tier4.sort()).toEqual(['HA', 'SJ', 'SK']);

    const step = apply(start, { seat: 'S', suit: 'C', rank: 'A' });
    const firstAuto = step.events.find((e) => e.type === 'autoplay');
    expect(firstAuto && firstAuto.type === 'autoplay' ? `${firstAuto.play.suit}${firstAuto.play.rank}` : null).toBe('SK');
  });

  test('discard policy-class collapsing groups busy by suit and idle into one class', () => {
    const step = apply(init(p001), { seat: 'S', suit: 'C', rank: 'A' });
    const wAuto = step.events.find((e) => e.type === 'autoplay' && e.play.seat === 'W');
    expect(wAuto && wAuto.type === 'autoplay').toBe(true);
    if (!wAuto || wAuto.type !== 'autoplay') return;
    expect(wAuto.chosenBucket).toBe('tier3b');
    expect(wAuto.bucketCards?.sort()).toEqual(['HA', 'SJ', 'SK']);
    expect(wAuto.policyClassByCard).toEqual({
      SK: 'busy:S',
      SJ: 'busy:S',
      HA: 'busy:H'
    });
    const chosenCard = `${wAuto.play.suit}${wAuto.play.rank}` as CardId;
    const chosenAltClassId = wAuto.policyClassByCard?.[chosenCard] ?? `busy:${chosenCard[0]}`;
    const classOrder: string[] = [];
    for (const card of wAuto.bucketCards ?? []) {
      const cls = wAuto.policyClassByCard?.[card] ?? `busy:${card[0]}`;
      if (!classOrder.includes(cls)) classOrder.push(cls);
    }
    const sameBucketAlternativeClassIds = classOrder.filter((id) => id !== chosenAltClassId);
    expect(classOrder.sort()).toEqual(['busy:H', 'busy:S']);
    expect(sameBucketAlternativeClassIds.length).toBe(1);

    const transcript: SuccessfulTranscript = {
      problemId: p001.id,
      seed: p001.rngSeed,
      decisions: [
        {
          index: 0,
          seat: 'W',
          sig: wAuto.decisionSig ?? '',
          chosenCard,
          chosenClassId: classInfoForCard(init(p001), 'W', chosenCard).classId,
          chosenAltClassId,
          chosenBucket: wAuto.chosenBucket ?? 'tier3b',
          bucketCards: [...(wAuto.bucketCards ?? [])],
          sameBucketAlternativeClassIds,
          representativeCardByClass: {
            'busy:S': 'SK',
            'busy:H': 'HA'
          }
        }
      ],
      userPlays: []
    };
    const tried = new Set<string>([
      triedAltKey(transcript.problemId, 0, transcript.decisions[0].chosenBucket, transcript.decisions[0].chosenAltClassId)
    ]);
    expect(hasUntriedAlternatives(transcript, tried).ok).toBe(true);
    tried.add(triedAltKey(transcript.problemId, 0, transcript.decisions[0].chosenBucket, sameBucketAlternativeClassIds[0]));
    expect(hasUntriedAlternatives(transcript, tried).ok).toBe(false);

    const idleProblem: Problem = {
      id: 'idle-policy-class',
      contract: { strain: 'NT' },
      leader: 'S',
      userControls: ['S'],
      goal: { type: 'minTricks', side: 'NS', n: 0 },
      hands: {
        N: { S: ['8'], H: [], D: [], C: [] },
        E: { S: ['K'], H: [], D: [], C: [] },
        S: { S: [], H: ['A'], D: [], C: [] },
        W: { S: [], H: [], D: ['2'], C: ['3'] }
      },
      policies: {
        W: { kind: 'threatAware' },
        E: { kind: 'randomLegal' },
        N: { kind: 'randomLegal' }
      },
      threatCardIds: ['S8'],
      rngSeed: 9
    };
    const idleStep = apply(init(idleProblem), { seat: 'S', suit: 'H', rank: 'A' });
    const idleAuto = idleStep.events.find((e) => e.type === 'autoplay' && e.play.seat === 'W');
    expect(idleAuto && idleAuto.type === 'autoplay').toBe(true);
    if (!idleAuto || idleAuto.type !== 'autoplay') return;
    expect(idleAuto.chosenBucket).toBe('tier1a');
    expect(idleAuto.bucketCards?.sort()).toEqual(['C3', 'D2']);
    expect(idleAuto.policyClassByCard).toEqual({
      D2: 'idle:tier1',
      C3: 'idle:tier1'
    });
  });

  test('follow decisions collapse equals alternatives into one alt class', () => {
    const problem: Problem = {
      id: 'follow-equals-collapse',
      contract: { strain: 'NT' },
      leader: 'N',
      userControls: ['N'],
      goal: { type: 'minTricks', side: 'NS', n: 0 },
      hands: {
        N: { S: ['A'], H: [], D: [], C: [] },
        E: { S: ['J', 'T'], H: [], D: [], C: [] },
        S: { S: ['2'], H: [], D: [], C: [] },
        W: { S: ['3'], H: [], D: [], C: [] }
      },
      policies: {
        E: { kind: 'threatAware' },
        S: { kind: 'randomLegal' },
        W: { kind: 'randomLegal' }
      },
      threatCardIds: ['S2'],
      rngSeed: 21
    };

    const start = init(problem);
    const step = apply(start, { seat: 'N', suit: 'S', rank: 'A' });
    const eAuto = step.events.find((e) => e.type === 'autoplay' && e.play.seat === 'E');
    expect(eAuto && eAuto.type === 'autoplay').toBe(true);
    if (!eAuto || eAuto.type !== 'autoplay') return;

    const chosenCard = `${eAuto.play.suit}${eAuto.play.rank}` as CardId;
    const bucketCards = eAuto.bucketCards ? [...eAuto.bucketCards] : [chosenCard];
    expect(bucketCards.sort()).toEqual(['SJ', 'ST']);
    expect(eAuto.policyClassByCard).toBeTruthy();
    if (!eAuto.policyClassByCard) return;

    const classOrder: string[] = [];
    const representativeCardByClass: Record<string, CardId> = {};
    const chosenPolicyClassId = eAuto.policyClassByCard[chosenCard] ?? classInfoForCard(start, 'E', chosenCard).classId;
    for (const card of bucketCards) {
      const classId = eAuto.policyClassByCard[card] ?? classInfoForCard(start, 'E', card).classId;
      if (!classOrder.includes(classId)) classOrder.push(classId);
      if (!representativeCardByClass[classId]) representativeCardByClass[classId] = card;
    }
    if (classOrder.includes(chosenPolicyClassId)) representativeCardByClass[chosenPolicyClassId] = chosenCard;
    const sameBucketAlternativeClassIds = classOrder.filter((id) => id !== chosenPolicyClassId);

    expect(eAuto.policyClassByCard.SJ).toBe(eAuto.policyClassByCard.ST);
    expect(classOrder.length).toBe(1);
    expect(sameBucketAlternativeClassIds).toEqual([]);
  });

  test('coordinated busy suit feeds tier2 before solo tiers', () => {
    const position = {
      hands: {
        N: { S: ['9', '8'], H: [], D: [], C: [] },
        E: { S: ['A', '2'], H: [], D: [], C: [] },
        S: { S: ['Q', 'J'], H: [], D: [], C: [] },
        W: { S: ['K', '3'], H: [], D: [], C: [] }
      }
    };

    const ctx = initThreatContext(position, ['S8']);
    const labels = computeDefenderLabels(ctx, position);
    const tiers = computeDiscardTiers('W', position, 'C', ctx, labels);

    expect(tiers.tier1a).toEqual([]);
    expect(tiers.tier1b).toEqual([]);
    expect(tiers.tier1c).toEqual([]);
    expect(tiers.tier2a).toEqual(['S3']);
    expect(tiers.tier2b.sort()).toEqual(['S3', 'SK']);
    expect(tiers.tier3a).toEqual([]);
    expect(tiers.tier3b).toEqual([]);
    expect(tiers.tier4.sort()).toEqual(['S3', 'SK']);
  });

  test('threatAware fails fast when threatCardIds are missing', () => {
    const bad: Problem = {
      id: 'missing-threats',
      contract: { strain: 'NT' },
      leader: 'N',
      userControls: ['N', 'S'],
      goal: { type: 'minTricks', side: 'NS', n: 1 },
      hands: {
        N: { S: ['A'], H: [], D: [], C: [] },
        E: { S: ['K'], H: [], D: [], C: [] },
        S: { S: ['Q'], H: [], D: [], C: [] },
        W: { S: ['J'], H: [], D: [], C: [] }
      },
      policies: { E: { kind: 'threatAware' } },
      rngSeed: 1
    };

    expect(() => init(bad)).toThrow(/threatCardIds/);
  });

  test('p002 preferred discards fire on first discard opportunities (W:DA, E:H7)', () => {
    let state = init(p002);

    const step1 = apply(state, { seat: 'S', suit: 'C', rank: 'T' });
    state = step1.state;
    const wAuto = step1.events.find((e) => e.type === 'autoplay' && e.play.seat === 'W');
    expect(wAuto && wAuto.type === 'autoplay' ? `${wAuto.play.suit}${wAuto.play.rank}` : null).toBe('DA');
    expect(wAuto && wAuto.type === 'autoplay' ? wAuto.preferredDiscard?.reason : null).toBe('applied');

    const nPlay = legalPlays(state)[0];
    const step2 = apply(state, nPlay);
    const eAuto = step2.events.find((e) => e.type === 'autoplay' && e.play.seat === 'E');
    expect(eAuto && eAuto.type === 'autoplay' ? `${eAuto.play.suit}${eAuto.play.rank}` : null).toBe('H7');
    expect(eAuto && eAuto.type === 'autoplay' ? eAuto.preferredDiscard?.reason : null).toBe('applied');
  });

  test('idle tier split 1a/1b/1c dominates busy tiers', () => {
    const labels: DefenderLabels = {
      E: { busy: new Set(['S9', 'SQ']), idle: new Set(['H4', 'D4', 'D7']) },
      W: { busy: new Set(['SK']), idle: new Set() }
    };

    const position = {
      hands: {
        N: { S: [], H: [], D: [], C: [] },
        E: { S: ['Q', '9'], H: ['4'], D: ['7', '4'], C: [] },
        S: { S: [], H: [], D: [], C: ['2'] },
        W: { S: ['K'], H: [], D: [], C: [] }
      }
    };

    const ctx = initThreatContext(
      {
        hands: {
          N: { S: [], H: ['8'], D: ['8'], C: [] },
          E: { S: ['Q', '9'], H: ['4'], D: ['7', '4'], C: [] },
          S: { S: [], H: [], D: [], C: ['2'] },
          W: { S: ['K'], H: [], D: [], C: [] }
        }
      },
      ['S9', 'H8', 'D8']
    );
    const inactiveCtx = {
      ...ctx,
      threatsBySuit: {
        ...ctx.threatsBySuit,
        D: ctx.threatsBySuit.D ? { ...ctx.threatsBySuit.D, active: false, threatLength: 0 } : undefined
      }
    };

    const tiers = computeDiscardTiers('E', position, 'C', inactiveCtx, labels);
    expect(tiers.tier1a).toEqual(['D7', 'D4']);
    expect(tiers.tier1b).toEqual(['H4']);
    expect(tiers.tier1c).toEqual([]);
    expect(tiers.tier2a).toEqual([]);
    expect(tiers.tier2b.sort()).toEqual(['S9', 'SQ']);

    const chosen = chooseDiscard('E', position, 'C', inactiveCtx, labels, () => 0);
    expect(chosen).toBe('D7');
  });

  test('replaying from pre-user snapshot reproduces identical autoplay and state', () => {
    const start = init(p001);
    const play = { seat: 'S', suit: 'C', rank: 'A' } as const;
    const snapshot = structuredClone(start);

    const first = apply(start, play);
    const replay = apply(snapshot, play);

    const autoSeq = (events: typeof first.events) =>
      events
        .filter((e) => e.type === 'autoplay')
        .map((e) => (e.type === 'autoplay' ? `${e.play.seat}:${e.play.suit}${e.play.rank}` : ''));

    expect(autoSeq(first.events)).toEqual(autoSeq(replay.events));
    expect(first.state).toEqual(replay.state);
  });

  test('classification updates mid-trick after each play and affects later tiers', () => {
    const problem: Problem = {
      id: 'mid-trick-label-update',
      contract: { strain: 'NT' },
      leader: 'S',
      userControls: ['S', 'N'],
      goal: { type: 'minTricks', side: 'NS', n: 0 },
      hands: {
        N: { S: ['A', 'Q', '9'], H: [], D: [], C: ['2'] },
        E: { S: ['K', 'J', '2'], H: [], D: [], C: [] },
        S: { S: [], H: [], D: [], C: ['A'] },
        W: { S: ['T', '8', '7'], H: [], D: [], C: [] }
      },
      policies: {
        W: { kind: 'threatAware' },
        E: { kind: 'threatAware' }
      },
      threatCardIds: ['S9'],
      preferredDiscards: {},
      rngSeed: 5
    };

    const start = init(problem);
    expect(start.threat?.threatsBySuit.S?.stopStatus).toBe('double');
    const step = apply(start, { seat: 'S', suit: 'C', rank: 'A' });

    const wAuto = step.events.find((e) => e.type === 'autoplay' && e.play.seat === 'W');
    expect(wAuto && wAuto.type === 'autoplay' ? `${wAuto.play.suit}${wAuto.play.rank}` : null).toBe('S8');

    const labels = step.state.threatLabels!;
    expect([...labels.W.busy].filter((id) => id.startsWith('S')).length).toBe(0);
    expect(step.state.threat?.threatsBySuit.S?.stopStatus).toBe('single');

    const tiersForE = computeDiscardTiers('E', { hands: step.state.hands }, 'C', step.state.threat!, labels);
    expect(tiersForE.tier2a).toEqual([]);
    expect(tiersForE.tier2b).toEqual([]);
    expect(tiersForE.tier3a).toEqual(['S2']);
    expect(tiersForE.tier3b.sort()).toEqual(['S2', 'SJ', 'SK']);
  });

  test('threatAware follow-suit chooses below-threshold cards when available', () => {
    const problem: Problem = {
      id: 'follow-threshold',
      contract: { strain: 'NT' },
      leader: 'N',
      userControls: ['N'],
      goal: { type: 'minTricks', side: 'NS', n: 0 },
      hands: {
        N: { S: ['9', '8'], H: [], D: [], C: [] },
        E: { S: ['K', '7'], H: [], D: [], C: [] },
        S: { S: ['2'], H: [], D: [], C: [] },
        W: { S: ['3'], H: [], D: [], C: [] }
      },
      policies: {
        E: { kind: 'threatAware' },
        S: { kind: 'randomLegal' },
        W: { kind: 'randomLegal' }
      },
      threatCardIds: ['S8'],
      rngSeed: 42
    };

    const start = init(problem);
    const step = apply(start, { seat: 'N', suit: 'S', rank: '9' });
    const eAuto = step.events.find((e) => e.type === 'autoplay' && e.play.seat === 'E');
    expect(eAuto && eAuto.type === 'autoplay' ? `${eAuto.play.suit}${eAuto.play.rank}` : null).toBe('S7');
  });

  test('replay state forces recorded defender autoplay decision on matching signature', () => {
    const start = init(p001);
    const step = apply(start, { seat: 'S', suit: 'C', rank: 'A' });
    const firstAuto = step.events.find((e) => e.type === 'autoplay' && (e.play.seat === 'E' || e.play.seat === 'W'));
    expect(firstAuto && firstAuto.type === 'autoplay' ? firstAuto.decisionSig : null).toBeTruthy();

    const transcript: SuccessfulTranscript = {
      problemId: p001.id,
      seed: p001.rngSeed,
      decisions: [
        {
          index: 0,
          seat: firstAuto!.play.seat as 'E' | 'W',
          sig: firstAuto!.decisionSig!,
          chosenCard: `${firstAuto!.play.suit}${firstAuto!.play.rank}` as CardId,
          chosenClassId: `${firstAuto!.play.seat}:${firstAuto!.play.suit}:${firstAuto!.play.rank}-${firstAuto!.play.rank}`,
          chosenAltClassId: `${firstAuto!.play.seat}:${firstAuto!.play.suit}:${firstAuto!.play.rank}-${firstAuto!.play.rank}`,
          chosenBucket: firstAuto!.chosenBucket ?? 'unknown',
          bucketCards: firstAuto!.bucketCards ? [...firstAuto!.bucketCards] : [`${firstAuto!.play.suit}${firstAuto!.play.rank}` as CardId],
          sameBucketAlternativeClassIds: [],
          representativeCardByClass: {}
        }
      ],
      userPlays: []
    };

    const replayed = init(p001);
    replayed.replay = { enabled: true, transcript, cursor: 0, divergenceIndex: null, forcedCard: null };
    const replayStep = apply(replayed, { seat: 'S', suit: 'C', rank: 'A' });
    const replayAuto = replayStep.events.find((e) => e.type === 'autoplay' && (e.play.seat === 'E' || e.play.seat === 'W'));
    expect(replayAuto && replayAuto.type === 'autoplay' ? replayAuto.replay?.action : null).toBe('forced');
    expect(replayAuto && replayAuto.type === 'autoplay' ? `${replayAuto.play.suit}${replayAuto.play.rank}` : null).toBe(
      `${firstAuto!.play.suit}${firstAuto!.play.rank}`
    );
  });

  test('p001 play-again alternatives exhaust after baseline chosen class and forced class are both tried', () => {
    const start = init(p001);
    const step = apply(start, { seat: 'S', suit: 'C', rank: 'A' });
    const firstAuto = step.events.find((e) => e.type === 'autoplay' && (e.play.seat === 'E' || e.play.seat === 'W'));
    expect(firstAuto && firstAuto.type === 'autoplay').toBe(true);
    if (!firstAuto || firstAuto.type !== 'autoplay') return;

    const chosenCard = `${firstAuto.play.suit}${firstAuto.play.rank}` as CardId;
    const bucketCards = firstAuto.bucketCards ? [...firstAuto.bucketCards] : [chosenCard];
    const classOrder: string[] = [];
    const representativeCardByClass: Record<string, CardId> = {};
    for (const card of bucketCards) {
      const info = classInfoForCard(start, firstAuto.play.seat, card);
      if (!classOrder.includes(info.classId)) classOrder.push(info.classId);
      if (!representativeCardByClass[info.classId]) representativeCardByClass[info.classId] = info.representative;
    }
    const chosenClassId = classInfoForCard(start, firstAuto.play.seat, chosenCard).classId;
    const sameBucketAlternativeClassIds = classOrder.filter((id) => id !== chosenClassId);
    const spadeClassIds = new Set(
      bucketCards
        .filter((card) => card.startsWith('S'))
        .map((card) => classInfoForCard(start, firstAuto.play.seat, card).classId)
    );
    expect(spadeClassIds.size).toBe(1);

    const transcript: SuccessfulTranscript = {
      problemId: p001.id,
      seed: p001.rngSeed,
      decisions: [
        {
          index: 0,
          seat: firstAuto.play.seat,
          sig: firstAuto.decisionSig ?? '',
          chosenCard,
          chosenClassId,
          chosenAltClassId: chosenClassId,
          chosenBucket: firstAuto.chosenBucket ?? 'unknown',
          bucketCards,
          sameBucketAlternativeClassIds,
          representativeCardByClass
        }
      ],
      userPlays: []
    };

    expect(sameBucketAlternativeClassIds.length).toBeGreaterThan(0);
    const tried = new Set<string>([
      triedAltKey(transcript.problemId, 0, transcript.decisions[0].chosenBucket, transcript.decisions[0].chosenAltClassId)
    ]);
    expect(tried.has(triedAltKey(transcript.problemId, 0, transcript.decisions[0].chosenBucket, transcript.decisions[0].chosenAltClassId))).toBe(true);
    expect(hasUntriedAlternatives(transcript, tried).ok).toBe(true);

    const forcedAltClass = sameBucketAlternativeClassIds[0];
    tried.add(triedAltKey(transcript.problemId, 0, transcript.decisions[0].chosenBucket, forcedAltClass));

    expect(hasUntriedAlternatives(transcript, tried).ok).toBe(false);
    const reseededTranscript: SuccessfulTranscript = { ...transcript, seed: transcript.seed + 1000 };
    expect(hasUntriedAlternatives(reseededTranscript, tried).ok).toBe(false);
  });

  test('p003-like play-again bookkeeping does not re-offer an already-explored policy class', () => {
    const tried = new Set<string>();

    const baseline: SuccessfulTranscript = {
      problemId: 'p003',
      seed: 101,
      decisions: [
        {
          index: 0,
          seat: 'E',
          sig: 'sig-0',
          chosenCard: 'SQ',
          chosenClassId: 'E:S:Q-Q',
          chosenAltClassId: 'busy:S',
          chosenBucket: 'tier3b',
          bucketCards: ['SQ', 'ST', 'DA'],
          sameBucketAlternativeClassIds: ['busy:D'],
          representativeCardByClass: { 'busy:S': 'SQ', 'busy:D': 'DA' }
        }
      ],
      userPlays: []
    };

    for (const rec of baseline.decisions) {
      tried.add(triedAltKey(baseline.problemId, rec.index, rec.chosenBucket, rec.chosenAltClassId));
    }
    expect(hasUntriedAlternatives(baseline, tried).ok).toBe(true);

    tried.add(triedAltKey(baseline.problemId, 0, 'tier3b', 'busy:D'));

    const forcedRun: SuccessfulTranscript = {
      ...baseline,
      seed: 202,
      decisions: [
        {
          ...baseline.decisions[0],
          chosenCard: 'DA',
          chosenClassId: 'E:D:A-A',
          chosenAltClassId: 'busy:D',
          sameBucketAlternativeClassIds: ['busy:S'],
          representativeCardByClass: { 'busy:S': 'ST', 'busy:D': 'DA' }
        }
      ]
    };
    for (const rec of forcedRun.decisions) {
      tried.add(triedAltKey(forcedRun.problemId, rec.index, rec.chosenBucket, rec.chosenAltClassId));
    }

    expect(hasUntriedAlternatives(forcedRun, tried).ok).toBe(false);
  });
});
