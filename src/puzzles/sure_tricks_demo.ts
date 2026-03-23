import type { Problem } from '../core';
import type { CardId } from '../ai/threatModel';

type ThreatProblem = Problem & { threatCardIds: CardId[] };
type SureTricksVariantId = 'a' | 'b';

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
