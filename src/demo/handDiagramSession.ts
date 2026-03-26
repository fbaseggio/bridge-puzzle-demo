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

export type HandDiagramSession = {
  status: HandDiagramStatus;
  dismissedOutcomeKey: string | null;
  readingControlsRevealed: boolean;
  followPromptCursor: number | null;
  stickyMessage: boolean;
  completedBranches: Set<string>;
  triedBranchOptions: Map<string, Set<CardId>>;
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
    dismissedOutcomeKey: null,
    readingControlsRevealed: false,
    followPromptCursor: null,
    stickyMessage: false,
    completedBranches: new Set<string>(),
    triedBranchOptions: new Map<string, Set<CardId>>(),
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
  session.triedBranchOptions.clear();
  session.hintCount = 0;
  session.mistakeCount = 0;
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
