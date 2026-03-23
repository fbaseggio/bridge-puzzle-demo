import { buildFeatureStateFromRuntime, getRankColorForFeatureRole } from '../ai/features';
import type { GoalStatus, State } from '../core';
import type { CardId, DefenderLabels, ThreatContext } from '../ai/threatModel';

// Architecture guard rails:
// - Approved dependency direction is semantic state -> card display projection.
// - Unapproved dependency direction is render code deriving semantic card meaning
//   directly from raw hands or ad hoc state inspection.
// - Unknown-mode card display may merge regular card display projections, but it
//   should not replace them with a separate semantic pipeline.

export type RankColorClass = 'rank--purple' | 'rank--green' | 'rank--blue' | 'rank--amber' | 'rank--grey' | 'rank--black';

export type RankColorVisual =
  | { kind: 'solid'; colorClass: RankColorClass }
  | { kind: 'split'; colors: RankColorClass[] }
  | { kind: 'stripes'; colors: RankColorClass[] };

function toRankColorClass(color: string): RankColorClass {
  if (color === 'purple') return 'rank--purple';
  if (color === 'green') return 'rank--green';
  if (color === 'blue') return 'rank--blue';
  if (color === 'amber') return 'rank--amber';
  if (color === 'grey') return 'rank--grey';
  return 'rank--black';
}

export function buildRegularRankColorClass(
  cardId: CardId,
  featureSource: Pick<State, 'cardRoles' | 'threat' | 'threatLabels'>,
  goalStatus: GoalStatus,
  teachingMode: boolean,
  coloringEnabled: boolean
): RankColorClass {
  if (!coloringEnabled) return 'rank--black';
  const features = buildFeatureStateFromRuntime({
    threat: (featureSource.threat as ThreatContext | null) ?? null,
    threatLabels: featureSource.threatLabels as DefenderLabels | null,
    cardRoles: featureSource.cardRoles,
    goalStatus
  });
  return toRankColorClass(getRankColorForFeatureRole(features.cardRoleById[cardId] ?? 'default', teachingMode));
}

export function buildRankColorVisual(colorClasses: RankColorClass[]): RankColorVisual {
  const deduped = colorClasses.filter((color, index, arr) => arr.indexOf(color) === index);
  if (deduped.length <= 1) return { kind: 'solid', colorClass: deduped[0] ?? 'rank--black' };
  if (deduped.length === 2) return { kind: 'split', colors: deduped };
  return { kind: 'stripes', colors: deduped };
}
