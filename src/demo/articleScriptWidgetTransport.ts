import type { CardId, Seat } from '../core';
import {
  resolveExplicitBranchAdvanceAction,
  shouldBlockArticleScriptUserAdvance
} from './articleScriptInteractionPolicy';
import type { InteractionProfile } from './interactionProfiles';
import type { ArticleScriptStateId } from './articleScriptRuntime';
import type {
  ArticleScriptWidgetAction,
  ArticleScriptWidgetActionCoreResult,
  ArticleScriptWidgetProgressionStep,
  ArticleScriptWidgetStartupMode
} from './articleScriptWidgetActionCore';

export type ArticleScriptWidgetTransportOutcome = 'advanced' | 'paused' | 'noop';

export type ArticleScriptWidgetTransportPauseReason =
  | 'follow-prompt'
  | 'explicit-choice-prompt'
  | 'trick-boundary'
  | 'checkpoint-or-end'
  | 'not-in-script'
  | 'no-advance';

export type ArticleScriptWidgetTransportEffect =
  | {
      type: 'set-follow-prompt';
      promptKind: 'follow-user-turn' | 'explicit-choice';
      cursor: number;
      seat: Seat;
    }
  | {
      type: 'clear-follow-prompt';
    }
  | {
      type: 'choice-confirmation';
      cardId: CardId;
    };

export type ArticleScriptWidgetTransportChoiceSnapshot = {
  seat: Seat;
  unresolvedOptions: CardId[];
  optionMode: string;
  choiceMessages: Partial<Record<CardId, string>>;
};

export type ArticleScriptWidgetTransportSnapshot = {
  scriptStateId: ArticleScriptStateId | null;
  scriptCursor: number | null;
  followPromptCursor: number | null;
  interactionProfile: InteractionProfile;
  phase: 'play' | 'end';
  turn: Seat;
  isUserTurn: boolean;
  hasRememberedTail: boolean;
  trickFrozen: boolean;
  canLeadDismiss: boolean;
  explicitChoice: ArticleScriptWidgetTransportChoiceSnapshot | null;
};

export type ArticleScriptWidgetTransportResult = {
  action: ArticleScriptWidgetAction;
  outcome: ArticleScriptWidgetTransportOutcome;
  pauseReason: ArticleScriptWidgetTransportPauseReason | null;
  steps: ArticleScriptWidgetProgressionStep[];
  effects: ArticleScriptWidgetTransportEffect[];
  iterations: number;
};

export type CreateArticleScriptWidgetTransportDeps = {
  readSnapshot: () => ArticleScriptWidgetTransportSnapshot;
  planAction: (
    action: ArticleScriptWidgetAction,
    options?: { startupMode?: ArticleScriptWidgetStartupMode }
  ) => ArticleScriptWidgetActionCoreResult | null;
  applyCoreResult: (planned: ArticleScriptWidgetActionCoreResult) => number;
  followPromptAdvance: () => boolean;
  chooseExplicitBranchOption: () => CardId | null;
  playCardById: (cardId: CardId) => { played: boolean; usedChoiceMessage: boolean };
  setFollowPromptCursor: (cursor: number) => void;
  clearFollowPromptCursor: () => void;
};

function isScriptStateActive(scriptStateId: ArticleScriptStateId | null): boolean {
  return scriptStateId === 'in-script' || scriptStateId === 'pre-script';
}

function resolvePostAdvancePauseReason(
  snapshot: ArticleScriptWidgetTransportSnapshot
): ArticleScriptWidgetTransportPauseReason | null {
  if (snapshot.trickFrozen || snapshot.phase === 'end') return 'trick-boundary';
  if (snapshot.explicitChoice && (snapshot.explicitChoice.optionMode ?? 'explicit') === 'explicit') {
    return 'explicit-choice-prompt';
  }
  return null;
}

export function createArticleScriptWidgetTransport(
  deps: CreateArticleScriptWidgetTransportDeps
) {
  function runNext(): ArticleScriptWidgetTransportResult {
    const before = deps.readSnapshot();
    if (!isScriptStateActive(before.scriptStateId) || before.scriptCursor === null) {
      return {
        action: 'next',
        outcome: 'noop',
        pauseReason: 'not-in-script',
        steps: [],
        effects: [],
        iterations: 1
      };
    }

    const effects: ArticleScriptWidgetTransportEffect[] = [];
    const blockedByUserPrompt = shouldBlockArticleScriptUserAdvance({
      profile: before.interactionProfile,
      isUserTurn: before.isUserTurn,
      hasRememberedTail: before.hasRememberedTail,
      trickFrozen: before.trickFrozen,
      canLeadDismiss: before.canLeadDismiss,
      phase: before.phase
    });
    if (blockedByUserPrompt) {
      if (before.followPromptCursor === before.scriptCursor && deps.followPromptAdvance()) {
        if (before.followPromptCursor !== null) {
          deps.clearFollowPromptCursor();
          effects.push({ type: 'clear-follow-prompt' });
        }
        const afterFollow = deps.readSnapshot();
        return {
          action: 'next',
          outcome: 'advanced',
          pauseReason: resolvePostAdvancePauseReason(afterFollow),
          steps: [],
          effects,
          iterations: 1
        };
      }
      deps.setFollowPromptCursor(before.scriptCursor);
      effects.push({
        type: 'set-follow-prompt',
        promptKind: 'follow-user-turn',
        cursor: before.scriptCursor,
        seat: before.turn
      });
      return {
        action: 'next',
        outcome: 'paused',
        pauseReason: 'follow-prompt',
        steps: [],
        effects,
        iterations: 1
      };
    }

    const explicitChoice = before.explicitChoice;
    if (explicitChoice && (explicitChoice.optionMode ?? 'explicit') === 'explicit') {
      const branchAdvanceAction = resolveExplicitBranchAdvanceAction({
        unresolvedOptionCount: explicitChoice.unresolvedOptions.length,
        followPromptActive: before.followPromptCursor === before.scriptCursor
      });
      if (branchAdvanceAction === 'choose' || branchAdvanceAction === 'choose-single') {
        const chosenCardId =
          deps.chooseExplicitBranchOption()
          ?? (branchAdvanceAction === 'choose-single' ? explicitChoice.unresolvedOptions[0] ?? null : null);
        if (chosenCardId) {
          const play = deps.playCardById(chosenCardId);
          if (play.played) {
            if (before.followPromptCursor !== null) {
              deps.clearFollowPromptCursor();
              effects.push({ type: 'clear-follow-prompt' });
            }
            if (!play.usedChoiceMessage) effects.push({ type: 'choice-confirmation', cardId: chosenCardId });
            const afterChoice = deps.readSnapshot();
            return {
              action: 'next',
              outcome: 'advanced',
              pauseReason: resolvePostAdvancePauseReason(afterChoice),
              steps: [],
              effects,
              iterations: 1
            };
          }
        }
      }
      if (branchAdvanceAction === 'prompt') {
        deps.setFollowPromptCursor(before.scriptCursor);
        effects.push({
          type: 'set-follow-prompt',
          promptKind: 'explicit-choice',
          cursor: before.scriptCursor,
          seat: explicitChoice.seat
        });
        return {
          action: 'next',
          outcome: 'paused',
          pauseReason: 'explicit-choice-prompt',
          steps: [],
          effects,
          iterations: 1
        };
      }
    }

    const planned = deps.planAction('next');
    if (!planned || !planned.changed) {
      return {
        action: 'next',
        outcome: 'paused',
        pauseReason: 'checkpoint-or-end',
        steps: [],
        effects,
        iterations: 1
      };
    }

    deps.applyCoreResult(planned);
    if (before.followPromptCursor !== null) {
      deps.clearFollowPromptCursor();
      effects.push({ type: 'clear-follow-prompt' });
    }
    const after = deps.readSnapshot();
    return {
      action: 'next',
      outcome: 'advanced',
      pauseReason: resolvePostAdvancePauseReason(after),
      steps: planned.steps,
      effects,
      iterations: 1
    };
  }

  function start(options: { startupMode?: ArticleScriptWidgetStartupMode } = {}): ArticleScriptWidgetTransportResult {
    const before = deps.readSnapshot();
    if (!isScriptStateActive(before.scriptStateId) || before.scriptCursor === null) {
      return {
        action: 'start',
        outcome: 'noop',
        pauseReason: 'not-in-script',
        steps: [],
        effects: [],
        iterations: 1
      };
    }

    const planned = deps.planAction('start', options);
    if (!planned || !planned.changed) {
      return {
        action: 'start',
        outcome: 'noop',
        pauseReason: 'no-advance',
        steps: [],
        effects: [],
        iterations: 1
      };
    }

    const effects: ArticleScriptWidgetTransportEffect[] = [];
    deps.applyCoreResult(planned);
    if (before.followPromptCursor !== null) {
      deps.clearFollowPromptCursor();
      effects.push({ type: 'clear-follow-prompt' });
    }
    const after = deps.readSnapshot();
    return {
      action: 'start',
      outcome: 'advanced',
      pauseReason: resolvePostAdvancePauseReason(after),
      steps: planned.steps,
      effects,
      iterations: 1
    };
  }

  function nextPause(): ArticleScriptWidgetTransportResult {
    const initial = deps.readSnapshot();
    if (!isScriptStateActive(initial.scriptStateId) || initial.scriptCursor === null) {
      return {
        action: 'nextPause',
        outcome: 'noop',
        pauseReason: 'not-in-script',
        steps: [],
        effects: [],
        iterations: 1
      };
    }

    const guard = 64;
    const allSteps: ArticleScriptWidgetProgressionStep[] = [];
    const allEffects: ArticleScriptWidgetTransportEffect[] = [];
    let pauseReason: ArticleScriptWidgetTransportPauseReason | null = null;
    let outcome: ArticleScriptWidgetTransportOutcome = 'noop';
    let iterations = 0;

    for (let i = 0; i < guard; i += 1) {
      const step = runNext();
      iterations += 1;
      allSteps.push(...step.steps);
      allEffects.push(...step.effects);

      if (step.outcome === 'advanced') {
        outcome = 'advanced';
        if (step.pauseReason) {
          pauseReason = step.pauseReason;
          break;
        }
        continue;
      }

      if (step.outcome === 'paused') {
        outcome = outcome === 'advanced' ? 'advanced' : 'paused';
        pauseReason = step.pauseReason;
      } else if (outcome !== 'advanced') {
        outcome = step.outcome;
        pauseReason = step.pauseReason;
      }
      break;
    }

    if (iterations === guard && pauseReason === null) pauseReason = 'no-advance';
    return {
      action: 'nextPause',
      outcome,
      pauseReason,
      steps: allSteps,
      effects: allEffects,
      iterations
    };
  }

  return {
    start,
    next: runNext,
    nextPause
  };
}
