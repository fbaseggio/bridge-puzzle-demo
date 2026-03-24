import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };
type SureTricksVariantId = 'a' | 'b';
type SureTricksEndingVariantId = 'a' | 'b';

const baseNorthSouth = {
  N: { S: ['A', 'T'], H: ['A', 'T'], D: [], C: ['A', 'Q'] },
  S: { S: ['3', '2'], H: [], D: ['Q'], C: ['K', 'J', 'T'] }
} as const;

const eastWestByVariant: Record<SureTricksVariantId, Pick<ThreatProblem['hands'], 'E' | 'W'>> = {
  a: {
    W: { S: ['K', 'Q', 'J'], H: ['K', 'Q', '9'], D: [], C: [] },
    E: { S: [], H: ['J'], D: ['A', 'K'], C: ['4', '3', '2'] }
  },
  b: {
    W: { S: ['K', 'Q'], H: ['K', 'Q', 'J', '9'], D: [], C: [] },
    E: { S: ['J'], H: [], D: ['A', 'K'], C: ['4', '3', '2'] }
  }
};

export const sureTricksDemoVariantIds: SureTricksVariantId[] = ['a', 'b'];

function buildSureTricksVariantHands(variantId: SureTricksVariantId): Pick<ThreatProblem['hands'], 'E' | 'W'> {
  const eastWest = eastWestByVariant[variantId] ?? eastWestByVariant.a;
  return {
    E: { ...eastWest.E },
    W: { ...eastWest.W }
  };
}

export function buildSureTricksDemoVariant(variantId: SureTricksVariantId): ThreatProblem {
  const eastWest = buildSureTricksVariantHands(variantId);
  return {
    id: 'sure_tricks_demo',
    contract: { strain: 'NT' },
    leader: 'S',
    userControls: ['N', 'S'],
    goal: { type: 'minTricks', side: 'NS', n: 6 },
    hands: {
      N: { ...baseNorthSouth.N },
      S: { ...baseNorthSouth.S },
      E: { ...eastWest.E },
      W: { ...eastWest.W }
    },
    policies: {
      E: { kind: 'threatAware' },
      W: { kind: 'threatAware' }
    },
    rngSeed: 1401,
    threatCardIds: ['ST', 'HT']
  };
}

export function buildSureTricksDemo(): ThreatProblem {
  return {
    ...buildSureTricksDemoVariant('a'),
    ewVariants: sureTricksDemoVariantIds.map((variantId) => ({
      id: variantId,
      label: `Version ${variantId.toUpperCase()}`,
      hands: buildSureTricksVariantHands(variantId)
    })),
    representativeEwVariantId: 'a'
  };
}

export const sureTricksDemo: ThreatProblem = buildSureTricksDemo();

const baseRuffOrSluffEndingNorthSouth = {
  N: { S: ['K', 'J'], H: [], D: ['A', '8', '6'], C: ['K', '6'] },
  S: { S: [], H: ['K', '5'], D: ['9', '7', '5', '4', '3'], C: [] }
} as const;

const ruffOrSluffEndingEastWestByVariant: Record<SureTricksEndingVariantId, Pick<ThreatProblem['hands'], 'E' | 'W'>> = {
  a: {
    W: { S: ['9', '8', '4', '3', '2'], H: [], D: [], C: ['8', '9'] },
    E: { S: ['Q', 'T'], H: [], D: ['Q', 'J', 'T', '2'], C: ['Q'] }
  },
  b: {
    W: { S: ['9', '8', '4', '3', '2'], H: [], D: ['Q', 'T'], C: [] },
    E: { S: ['Q', 'T'], H: [], D: ['J', '2'], C: ['Q', '9', '8'] }
  }
};

export const sureTricksRuffOrSluffEndingVariantIds: SureTricksEndingVariantId[] = ['a', 'b'];

function buildRuffOrSluffEndingVariantHands(
  variantId: SureTricksEndingVariantId
): Pick<ThreatProblem['hands'], 'E' | 'W'> {
  const eastWest = ruffOrSluffEndingEastWestByVariant[variantId] ?? ruffOrSluffEndingEastWestByVariant.a;
  return {
    E: { ...eastWest.E },
    W: { ...eastWest.W }
  };
}

export function buildSureTricksRuffOrSluffEndingVariant(variantId: SureTricksEndingVariantId): ThreatProblem {
  const eastWest = buildRuffOrSluffEndingVariantHands(variantId);
  return {
    id: 'sure_tricks_ruff_or_sluff_ending',
    contract: { strain: 'H' },
    leader: 'S',
    userControls: ['N', 'S'],
    goal: { type: 'minTricks', side: 'NS', n: 6 },
    hands: {
      N: { ...baseRuffOrSluffEndingNorthSouth.N },
      S: { ...baseRuffOrSluffEndingNorthSouth.S },
      E: { ...eastWest.E },
      W: { ...eastWest.W }
    },
    policies: {
      E: { kind: 'threatAware' },
      W: { kind: 'threatAware' }
    },
    rngSeed: 1975,
    threatCardIds: ['C6', 'D9', 'SJ']
  };
}

export function buildSureTricksRuffOrSluffEnding(): ThreatProblem {
  return {
    ...buildSureTricksRuffOrSluffEndingVariant('a'),
    ewVariants: sureTricksRuffOrSluffEndingVariantIds.map((variantId) => ({
      id: variantId,
      label: `Version ${variantId.toUpperCase()}`,
      hands: buildRuffOrSluffEndingVariantHands(variantId)
    })),
    representativeEwVariantId: 'a'
  };
}

export const sureTricksRuffOrSluffEnding: ThreatProblem = buildSureTricksRuffOrSluffEnding();
