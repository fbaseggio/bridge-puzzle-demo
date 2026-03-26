import type { CardId } from '../ai/threatModel';
import type { Seat } from '../core';

export type HandDiagramStatus =
  | { type: 'default'; text: string; html?: false | undefined }
  | { type: 'hint'; text: string; html?: false | undefined }
  | { type: 'narration'; text: string; html?: false | undefined }
  | { type: 'message'; text: string; html?: boolean | undefined };

export type HandDiagramNarrationEntry = {
  text: string;
  lines: string[];
  seat: Seat | null;
  seq: number;
};

export type HandDiagramCompanionContent = {
  title?: string;
  text: string;
  html?: boolean;
};

export type HandDiagramLeafStats = {
  mistakes: number;
  hints: number;
  outcome: 'success' | 'failure';
};

export type HandDiagramSession = {
  status: HandDiagramStatus;
  companionContent: HandDiagramCompanionContent | null;
  dismissedOutcomeKey: string | null;
  readingControlsRevealed: boolean;
  followPromptCursor: number | null;
  stickyMessage: boolean;
  completedBranches: Set<string>;
  knownBranches: Set<string>;
  triedBranchOptions: Map<string, Set<CardId>>;
  leafStatsByBranch: Map<string, HandDiagramLeafStats>;
  attributedLeafMistakes: number;
  attributedLeafHints: number;
  hintCount: number;
  mistakeCount: number;
  narrationEntries: HandDiagramNarrationEntry[];
  narrationLatest: HandDiagramNarrationEntry | null;
  narrationBySeat: Partial<Record<Seat, HandDiagramNarrationEntry>>;
  lastNarratedSeq: number;
};

export function createHandDiagramSession(): HandDiagramSession {
  return {
    status: { type: 'default', text: '' },
    companionContent: null,
    dismissedOutcomeKey: null,
    readingControlsRevealed: false,
    followPromptCursor: null,
    stickyMessage: false,
    completedBranches: new Set<string>(),
    knownBranches: new Set<string>(),
    triedBranchOptions: new Map<string, Set<CardId>>(),
    leafStatsByBranch: new Map<string, HandDiagramLeafStats>(),
    attributedLeafMistakes: 0,
    attributedLeafHints: 0,
    hintCount: 0,
    mistakeCount: 0,
    narrationEntries: [],
    narrationLatest: null,
    narrationBySeat: {},
    lastNarratedSeq: 0
  };
}

export function setMessage(session: HandDiagramSession, text: string, html = false): void {
  session.status = html
    ? { type: 'message', text, html: true }
    : { type: 'message', text };
}

export function setCompanionContent(
  session: HandDiagramSession,
  content: HandDiagramCompanionContent | null
): void {
  session.companionContent = content;
}

export function clearCompanionContent(session: HandDiagramSession): void {
  session.companionContent = null;
}

export function clearMessage(session: HandDiagramSession): void {
  if (session.status.type !== 'message') return;
  session.status = { type: 'default', text: '' };
  session.stickyMessage = false;
}

export function dismissOutcome(session: HandDiagramSession, outcomeKey: string | null): void {
  if (!outcomeKey) return;
  session.dismissedOutcomeKey = outcomeKey;
}

export function clearDismissedOutcomeIfChanged(session: HandDiagramSession, outcomeKey: string | null): void {
  if (!session.dismissedOutcomeKey) return;
  if (outcomeKey !== session.dismissedOutcomeKey) session.dismissedOutcomeKey = null;
}

export function setReadingControlsRevealed(session: HandDiagramSession, revealed: boolean): void {
  session.readingControlsRevealed = revealed;
}

export function resetReadingReveal(session: HandDiagramSession): void {
  session.readingControlsRevealed = false;
}

export function clearFollowPrompt(session: HandDiagramSession): void {
  session.followPromptCursor = null;
}

export function markBranchOptionTried(session: HandDiagramSession, branchName: string, cardId: CardId): void {
  const tried = session.triedBranchOptions.get(branchName);
  if (tried) {
    tried.add(cardId);
    return;
  }
  session.triedBranchOptions.set(branchName, new Set([cardId]));
}

export function resetArticleScriptTracking(session: HandDiagramSession): void {
  session.followPromptCursor = null;
  session.stickyMessage = false;
  session.completedBranches.clear();
  session.knownBranches.clear();
  session.triedBranchOptions.clear();
  session.leafStatsByBranch.clear();
  session.attributedLeafMistakes = 0;
  session.attributedLeafHints = 0;
  session.hintCount = 0;
  session.mistakeCount = 0;
  session.companionContent = null;
}

export function clearNarration(session: HandDiagramSession): void {
  if (session.status.type === 'narration') session.status = { type: 'default', text: '' };
  session.narrationLatest = null;
  session.narrationBySeat = {};
}

export function clearNarrationFeed(session: HandDiagramSession): void {
  session.narrationEntries = [];
  session.narrationLatest = null;
  session.narrationBySeat = {};
  session.lastNarratedSeq = 0;
  if (session.status.type === 'narration') session.status = { type: 'default', text: '' };
}
