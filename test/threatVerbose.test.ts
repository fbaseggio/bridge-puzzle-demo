import { describe, expect, test } from 'vitest';
import { computeDefenderLabels, initThreatContext, type CardId, type Position } from '../src/ai/threatModel';
import { formatAfterTrickBlock, formatDiscardDecisionBlock, formatInitBlock } from '../src/ai/threatModelVerbose';

describe('threat verbose formatters', () => {
  const position: Position = {
    hands: {
      N: { S: ['A', '8'], H: ['8'], D: [], C: [] },
      E: { S: [], H: [], D: ['A', 'K', 'Q'], C: [] },
      S: { S: ['5'], H: [], D: ['2'], C: ['A'] },
      W: { S: ['K', 'J'], H: ['A'], D: [], C: [] }
    }
  };

  test('formatInitBlock includes required init fields and derived p001-like labels', () => {
    const ctx = initThreatContext(position, ['H8' as CardId, 'S8' as CardId]);
    const labels = computeDefenderLabels(ctx, position);

    const block = formatInitBlock({
      problemId: 'p001',
      threatCardIdsRaw: ['H8', 'S8'],
      position,
      ctx,
      labels
    });

    expect(block).toContain('[THREAT:init] problem=p001');
    expect(block).toContain('rawThreatCardIds=H8 S8');
    expect(block).toContain('validation=OK');
    expect(block).toContain('suit=H');
    expect(block).toContain('threatLength=1');
    expect(block).toContain('suit=S');
    expect(block).toContain('threatLength=2');
    expect(block).toContain('defender=W');
    expect(block).toContain('busyCards=HA');
    expect(block).toContain('busyCards=SK SJ');
    expect(block).toContain('rankColors: H8=green S8=green');
    expect(block).toContain('rankColorsBusy: W:HA=blue W:SK=blue W:SJ=blue');
  });

  test('formatInitBlock reports validation error explicitly', () => {
    const block = formatInitBlock({
      problemId: 'bad',
      threatCardIdsRaw: ['H8', 'H9'],
      position,
      ctx: null,
      labels: null,
      validationError: 'Duplicate threat suit: H'
    });

    expect(block).toContain('validation=ERROR Duplicate threat suit: H');
  });

  test('after-trick and discard blocks contain required decision fields', () => {
    const ctx = initThreatContext(position, ['H8' as CardId, 'S8' as CardId]);
    const labels = computeDefenderLabels(ctx, position);

    const after = formatAfterTrickBlock({
      trickIndex: 1,
      leader: 'S',
      trick: [
        { seat: 'S', suit: 'C', rank: 'A' },
        { seat: 'W', suit: 'H', rank: 'A' },
        { seat: 'N', suit: 'S', rank: 'A' },
        { seat: 'E', suit: 'D', rank: 'A' }
      ],
      beforeCtx: ctx,
      afterCtx: ctx,
      beforeLabels: labels,
      afterLabels: labels,
      position
    });

    expect(after).toContain('[THREAT:after-trick]');
    expect(after).toContain('touchedThreatSuits=H S');
    expect(after).toContain('currentOwner=');
    expect(after).toContain('length=');
    expect(after).toContain('hasOver=');
    expect(after).toContain('busySummary E=');
    expect(after).toContain('rankColors: H8=green S8=green');
    expect(after).toContain('rankColorsBusy: W:HA=blue W:SK=blue W:SJ=blue');

    const discard = formatDiscardDecisionBlock({
      defender: 'W',
      ledSuit: 'D',
      trumpStrain: 'NT',
      ctx,
      labels,
      legal: ['HA', 'SJ', 'SK'],
      tier1a: ['HA'],
      tier1b: [],
      tier1c: [],
      tier2a: ['SJ'],
      tier2b: ['SJ', 'SK'],
      tier3a: [],
      tier3b: [],
      tier4: ['HA', 'SJ', 'SK'],
      chosen: 'HA',
      rngState: { seed: 101, counter: 3 }
    });

    expect(discard).toContain('[THREAT:discard] defender=W ledSuit=D trump=NT');
    expect(discard).toContain('threat suit=S active=true threatRank=8 threatLength=2');
    expect(discard).toContain('thresholds=H=8 S=8');
    expect(discard).toContain('tier1a=HA');
    expect(discard).toContain('tier2a=SJ');
    expect(discard).toContain('tier2b=SJ SK');
    expect(discard).toContain('candidate SJ status=busy group=solo belowThreat=false');
    expect(discard).toContain('chosenTier=tier1a chosen=HA');
    expect(discard).toContain('[THREAT:discard:explainTier1]');
    expect(discard).toContain('tier1Integrity');
    expect(discard).toContain('rng=seed:101 counter:3');
  });
});
