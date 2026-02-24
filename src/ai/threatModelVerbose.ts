import type { Play, Rank, Seat, Suit } from '../core';
import type { CardId, DefenderLabels, Position, ThreatContext } from './threatModel';
import { parseCardId, toCardId } from './threatModel';
import { getCardRankColor } from '../ui/annotations';
import { explainTier1Membership, getIdleThreatThresholdRank } from './defenderDiscard';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const SEATS: Seat[] = ['N', 'E', 'S', 'W'];
const RANK_VALUE: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};

function rankDesc(a: Rank, b: Rank): number {
  return RANK_VALUE[b] - RANK_VALUE[a];
}

function suitHolding(position: Position, seat: Seat, suit: Suit): Rank[] {
  return [...position.hands[seat][suit]].sort(rankDesc);
}

function ownersOfCard(position: Position, cardId: CardId): Seat[] {
  const { suit, rank } = parseCardId(cardId);
  return SEATS.filter((seat) => position.hands[seat][suit].includes(rank));
}

function fmtRanks(ranks: Rank[]): string {
  return ranks.length > 0 ? ranks.join(',') : '-';
}

function fmtCards(ids: CardId[]): string {
  return ids.length > 0 ? ids.join(' ') : '-';
}

function sortCardIds(ids: CardId[]): CardId[] {
  return [...ids].sort((a, b) => {
    const pa = parseCardId(a);
    const pb = parseCardId(b);
    if (pa.suit !== pb.suit) return pa.suit.localeCompare(pb.suit);
    return RANK_VALUE[pb.rank] - RANK_VALUE[pa.rank];
  });
}

function threatSuits(ctx: ThreatContext | null): Suit[] {
  if (!ctx) return [];
  return SUITS.filter((s) => Boolean(ctx.threatsBySuit[s]));
}

function isPromotedWinnerInSuit(suit: Suit, ctx: ThreatContext, labels: DefenderLabels): boolean {
  const threat = ctx.threatsBySuit[suit];
  if (!threat || !threat.active) return false;
  const eBusy = [...labels.E.busy].some((id) => id.startsWith(suit));
  const wBusy = [...labels.W.busy].some((id) => id.startsWith(suit));
  return !eBusy && !wBusy;
}

function formatRankColorsLine(ctx: ThreatContext | null, labels: DefenderLabels | null): string {
  if (!ctx || !labels || ctx.threatCardIds.length === 0) return 'rankColors: -';
  const parts = ctx.threatCardIds.map((cardId) => `${cardId}=${getCardRankColor(cardId, ctx, labels, true)}`);
  return `rankColors: ${parts.join(' ')}`;
}

function formatBusyColorLine(ctx: ThreatContext | null, labels: DefenderLabels | null): string {
  if (!ctx || !labels) return 'rankColorsBusy: -';
  const busy = sortCardIds([...labels.E.busy, ...labels.W.busy]);
  if (busy.length === 0) return 'rankColorsBusy: -';
  const seatOf = (cardId: CardId): 'E' | 'W' | '-' => (
    labels.E.busy.has(cardId) ? 'E' : labels.W.busy.has(cardId) ? 'W' : '-'
  );
  const parts = busy.map((cardId) => `${seatOf(cardId)}:${cardId}=${getCardRankColor(cardId, ctx, labels, true)}`);
  return `rankColorsBusy: ${parts.join(' ')}`;
}

export function formatInitBlock(params: {
  problemId: string;
  threatCardIdsRaw: string[];
  position: Position;
  ctx: ThreatContext | null;
  labels: DefenderLabels | null;
  validationError?: string;
}): string {
  const lines: string[] = [];
  lines.push(`[THREAT:init] problem=${params.problemId}`);
  lines.push(`rawThreatCardIds=${params.threatCardIdsRaw.join(' ') || '-'}`);

  for (const raw of params.threatCardIdsRaw) {
    try {
      const parsed = parseCardId(raw);
      const owners = ownersOfCard(params.position, raw as CardId);
      lines.push(
        `validate card=${raw} parsed=(${parsed.suit},${parsed.rank}) owner=${owners.length === 1 ? owners[0] : '-'} foundExactlyOnce=${owners.length === 1}`
      );
    } catch {
      lines.push(`validate card=${raw} parsed=(invalid) owner=- foundExactlyOnce=false`);
    }
  }

  if (params.validationError) {
    lines.push(`validation=ERROR ${params.validationError}`);
    return lines.join('\n');
  }

  lines.push('validation=OK');
  if (!params.ctx || !params.labels) {
    lines.push('threatState=none');
    return lines.join('\n');
  }

  for (const suit of threatSuits(params.ctx)) {
    const threat = params.ctx.threatsBySuit[suit];
    if (!threat) continue;
    const owners = ownersOfCard(params.position, threat.threatCardId);
    const currentOwner = owners.length === 1 ? owners[0] : '-';
    const ownerHold = currentOwner === '-' ? [] : suitHolding(params.position, currentOwner, suit);

    lines.push(
      `threat suit=${suit} card=${threat.threatCardId} threatRank=${threat.threatRank} initialOwner=${threat.establishedOwner} currentOwner=${currentOwner} active=${threat.active} threatLength=${threat.threatLength} stopStatus=${threat.stopStatus ?? '-'} ownerHolding=${fmtRanks(ownerHold)} promotedWinner=${isPromotedWinnerInSuit(suit, params.ctx, params.labels)}`
    );

    for (const defender of ['E', 'W'] as const) {
      const dHold = suitHolding(params.position, defender, suit);
      const hasOver = dHold.some((r) => RANK_VALUE[r] > RANK_VALUE[threat.threatRank]);
      const busy = dHold.length >= threat.threatLength && hasOver && threat.active && threat.threatLength > 0;
      const busyCards = [...params.labels[defender].busy].filter((id) => id.startsWith(suit));
      const idleCards = [...params.labels[defender].idle].filter((id) => id.startsWith(suit));
      lines.push(
        `labels suit=${suit} defender=${defender} holding=${fmtRanks(dHold)} hasOver=${hasOver} length=${dHold.length} busy=${busy} busyCards=${fmtCards(busyCards)} idleCards=${fmtCards(idleCards)}`
      );
    }
  }

  lines.push(formatRankColorsLine(params.ctx, params.labels));
  lines.push(formatBusyColorLine(params.ctx, params.labels));

  return lines.join('\n');
}

export function formatAfterTrickBlock(params: {
  trickIndex: number;
  leader: Seat;
  trick: Play[];
  beforeCtx: ThreatContext | null;
  afterCtx: ThreatContext | null;
  beforeLabels: DefenderLabels | null;
  afterLabels: DefenderLabels | null;
  position: Position;
}): string {
  const lines: string[] = [];
  lines.push(`[THREAT:after-trick] index=${params.trickIndex} leader=${params.leader} trick=${params.trick.map((p) => `${p.seat}:${toCardId(p.suit, p.rank)}`).join(' ')}`);

  const suitsInTrick = new Set<Suit>(params.trick.map((p) => p.suit));
  const threatened = new Set<Suit>([...threatSuits(params.beforeCtx), ...threatSuits(params.afterCtx)]);
  const touchedThreatSuits = [...suitsInTrick].filter((s) => threatened.has(s));
  lines.push(`touchedThreatSuits=${touchedThreatSuits.join(' ') || '-'}`);

  for (const suit of touchedThreatSuits) {
    const before = params.beforeCtx?.threatsBySuit[suit];
    const after = params.afterCtx?.threatsBySuit[suit];
    if (!after) continue;

    const owners = ownersOfCard(params.position, after.threatCardId);
    const currentOwner = owners.length === 1 ? owners[0] : '-';
    lines.push(`suit=${suit} threatCard=${after.threatCardId} currentOwner=${currentOwner} initialOwner=${after.establishedOwner}`);

    for (const defender of ['E', 'W'] as const) {
      const hold = suitHolding(params.position, defender, suit);
      const hasOver = hold.some((r) => RANK_VALUE[r] > RANK_VALUE[after.threatRank]);
      lines.push(`suit=${suit} defender=${defender} length=${hold.length} hasOver=${hasOver}`);
    }

    if (before?.active && !after.active) {
      lines.push(`suit=${suit} THREAT OFF reason=designated-card-owner-changed initialOwner=${after.establishedOwner} currentOwner=${currentOwner}`);
      continue;
    }

    const beforeLen = before?.threatLength ?? 0;
    const afterLen = after.threatLength;
    lines.push(`suit=${suit} active=${after.active} threatLength ${beforeLen}->${afterLen}`);
    if (params.afterLabels) {
      lines.push(`suit=${suit} promotedWinner=${isPromotedWinnerInSuit(suit, params.afterCtx!, params.afterLabels)}`);
    }

    for (const defender of ['E', 'W'] as const) {
      const bBusy = params.beforeLabels ? sortCardIds([...params.beforeLabels[defender].busy].filter((id) => id.startsWith(suit))) : [];
      const aBusy = params.afterLabels ? sortCardIds([...params.afterLabels[defender].busy].filter((id) => id.startsWith(suit))) : [];
      const aIdle = params.afterLabels ? sortCardIds([...params.afterLabels[defender].idle].filter((id) => id.startsWith(suit))) : [];
      lines.push(`suit=${suit} defender=${defender} busyCards ${fmtCards(bBusy)} -> ${fmtCards(aBusy)}`);
      if (fmtCards(bBusy) !== fmtCards(aBusy)) {
        lines.push(`suit=${suit} defender=${defender} busyNow=${fmtCards(aBusy)} idleNow=${fmtCards(aIdle)}`);
      }
    }
  }

  if (params.afterLabels) {
    const eBusy = [...params.afterLabels.E.busy].sort();
    const wBusy = [...params.afterLabels.W.busy].sort();
    lines.push(`busySummary E=${fmtCards(eBusy)} | W=${fmtCards(wBusy)}`);
  }
  lines.push(formatRankColorsLine(params.afterCtx, params.afterLabels));
  lines.push(formatBusyColorLine(params.afterCtx, params.afterLabels));

  return lines.join('\n');
}

export function formatAfterPlayBlock(params: {
  play: Play;
  beforeCtx: ThreatContext | null;
  afterCtx: ThreatContext | null;
  beforeLabels: DefenderLabels | null;
  afterLabels: DefenderLabels | null;
}): string {
  const lines: string[] = [];
  lines.push(`[THREAT:after-play] seat=${params.play.seat} played=${toCardId(params.play.suit, params.play.rank)}`);
  const suit = params.play.suit;
  const dirty = (params.beforeCtx?.threatsBySuit[suit] || params.afterCtx?.threatsBySuit[suit]) ? [suit] : [];
  lines.push(`dirtyThreatSuits=${dirty.join(' ') || '-'}`);
  for (const ds of dirty) {
    const before = params.beforeCtx?.threatsBySuit[ds];
    const after = params.afterCtx?.threatsBySuit[ds];
    if (!after) continue;
    lines.push(
      `suit=${ds} active=${after.active} threatLength ${(before?.threatLength ?? 0)}->${after.threatLength} stopStatus=${before?.stopStatus ?? '-'}->${after.stopStatus ?? '-'}`
    );
    for (const defender of ['E', 'W'] as const) {
      const bBusy = params.beforeLabels ? sortCardIds([...params.beforeLabels[defender].busy].filter((id) => id.startsWith(ds))) : [];
      const aBusy = params.afterLabels ? sortCardIds([...params.afterLabels[defender].busy].filter((id) => id.startsWith(ds))) : [];
      lines.push(`suit=${ds} defender=${defender} busyCards ${fmtCards(bBusy)} -> ${fmtCards(aBusy)}`);
    }
    if (params.afterCtx && params.afterLabels) {
      lines.push(`suit=${ds} promotedWinner=${isPromotedWinnerInSuit(ds, params.afterCtx, params.afterLabels)}`);
    }
  }
  return lines.join('\n');
}

export function formatDiscardDecisionBlock(params: {
  defender: 'E' | 'W';
  ledSuit: Suit | null;
  trumpStrain: Suit | 'NT';
  ctx: ThreatContext | null;
  labels: DefenderLabels | null;
  legal: CardId[];
  tier1a: CardId[];
  tier1b: CardId[];
  tier1c: CardId[];
  tier2a: CardId[];
  tier2b: CardId[];
  tier3a: CardId[];
  tier3b: CardId[];
  tier4: CardId[];
  chosen: CardId;
  rngState?: { seed: number; counter: number };
}): string {
  let tier = 'tier4';
  if (params.tier1a.includes(params.chosen)) tier = 'tier1a';
  else if (params.tier1b.includes(params.chosen)) tier = 'tier1b';
  else if (params.tier1c.includes(params.chosen)) tier = 'tier1c';
  else if (params.tier2a.includes(params.chosen)) tier = 'tier2a';
  else if (params.tier2b.includes(params.chosen)) tier = 'tier2b';
  else if (params.tier3a.includes(params.chosen)) tier = 'tier3a';
  else if (params.tier3b.includes(params.chosen)) tier = 'tier3b';
  const legalSuits = [...new Set(params.legal.map((id) => parseCardId(id).suit))];
  const partner: 'E' | 'W' = params.defender === 'E' ? 'W' : 'E';
  const lines = [
    `[THREAT:discard] defender=${params.defender} ledSuit=${params.ledSuit ?? 'none'} trump=${params.trumpStrain}`,
    `legal=${fmtCards(params.legal)}`,
    `tier1a=${fmtCards(params.tier1a)}`,
    `tier1b=${fmtCards(params.tier1b)}`,
    `tier1c=${fmtCards(params.tier1c)}`,
    `tier2a=${fmtCards(params.tier2a)}`,
    `tier2b=${fmtCards(params.tier2b)}`,
    `tier3a=${fmtCards(params.tier3a)}`,
    `tier3b=${fmtCards(params.tier3b)}`,
    `tier4=${fmtCards(params.tier4)}`,
    `chosenTier=${tier} chosen=${params.chosen}`,
    `rng=${params.rngState ? `seed:${params.rngState.seed} counter:${params.rngState.counter}` : 'n/a'}`
  ];

  for (const suit of legalSuits) {
    const threat = params.ctx?.threatsBySuit[suit];
    if (!threat) continue;
    lines.push(
      `threat suit=${suit} active=${threat.active} threatRank=${threat.threatRank} threatLength=${threat.threatLength} stopStatus=${threat.stopStatus ?? '-'}`
    );
  }
  if (params.ctx && params.labels) {
    const ctx = params.ctx;
    const labels = params.labels;
    const thresholdParts = legalSuits
      .map((suit) => {
        const threshold = getIdleThreatThresholdRank(suit, ctx, labels);
        return threshold ? `${suit}=${threshold}` : null;
      })
      .filter((v): v is string => Boolean(v));
    lines.push(`thresholds=${thresholdParts.length > 0 ? thresholdParts.join(' ') : '-'}`);
  }

  for (const card of params.legal) {
    const { suit, rank } = parseCardId(card);
    const isBusy = Boolean(params.labels?.[params.defender].busy.has(card));
    const isIdle = Boolean(params.labels?.[params.defender].idle.has(card));
    const threat = params.ctx?.threatsBySuit[suit];
    const activeThreat = Boolean(threat?.active);
    const selfBusyInSuit = Boolean(params.labels && [...params.labels[params.defender].busy].some((id) => id.startsWith(suit)));
    const partnerBusyInSuit = Boolean(params.labels && [...params.labels[partner].busy].some((id) => id.startsWith(suit)));
    const coordinated = activeThreat && selfBusyInSuit && partnerBusyInSuit;
    const tierBelowThreat = Boolean(
      isBusy && threat && threat.active && RANK_VALUE[rank] < RANK_VALUE[threat.threatRank]
    );
    lines.push(
      `candidate ${card} status=${isIdle ? 'idle' : isBusy ? 'busy' : 'unknown'} group=${coordinated ? 'coordinated' : 'solo'} belowThreat=${tierBelowThreat}`
    );
  }

  if (params.ctx && params.labels) {
    const explain = explainTier1Membership(params.defender, params.legal, params.ctx, params.labels);
    const fmt = (r: Rank | null) => (r ?? '-');
    const fmtRankNum = (r: Rank) => String(RANK_VALUE[r]);
    lines.push('[THREAT:discard:explainTier1]');
    lines.push(`defender=${params.defender} ledSuit=${params.ledSuit ?? 'none'} trump=${params.trumpStrain}`);
    lines.push(
      `activeThreats=${explain.activeThreats.length > 0
        ? explain.activeThreats
          .map((t) => `${t.suit}(active=${t.active} threatRank=${t.threatRank} promotedWinnerRank=${fmt(t.promotedWinnerRank)} threshold=${t.threshold} stopStatus=${t.stopStatus})`)
          .join(' ')
        : '-'}`
    );
    for (const c of explain.cards) {
      lines.push(
        `card=${c.cardId} suit=${c.suit} rank=${fmtRankNum(c.rank)} label=${c.label} idle=${c.idle} suitActiveThreat=${c.suitActiveThreat} threshold=${fmt(c.threshold)} rank<threshold?=${c.rankBelowThreshold === null ? '-' : c.rankBelowThreshold} tier1a?=${c.tier1a} tier1b?=${c.tier1b} tier1c?=${c.tier1c}`
      );
    }
    lines.push(`tier1Integrity idleLegal=${explain.idleLegal.length} tier1sum=${explain.tier1a.length + explain.tier1b.length + explain.tier1c.length} ok=${explain.integrityOk}`);
    if (!explain.integrityOk) {
      lines.push(`tier1Integrity ERROR missing=${fmtCards(explain.missing)} overlap=${fmtCards(explain.overlap)}`);
    }
  }

  return lines.join('\n');
}
