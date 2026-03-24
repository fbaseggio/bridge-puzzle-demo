import type { Problem } from '../core';
import { ruffOrSluff01, ruffOrSluff01c, ruffOrSluff02 } from './ruff_or_sluff';

function cloneProblem(problem: Problem, id: string): Problem {
  return {
    ...problem,
    id,
    hands: {
      N: { ...problem.hands.N },
      E: { ...problem.hands.E },
      S: { ...problem.hands.S },
      W: { ...problem.hands.W }
    },
    policies: { ...problem.policies },
    userControls: [...problem.userControls],
    threatCardIds: problem.threatCardIds ? [...problem.threatCardIds] : undefined,
    resourceCardIds: problem.resourceCardIds ? [...problem.resourceCardIds] : undefined,
    draftNotes: problem.draftNotes ? [...problem.draftNotes] : undefined,
    scriptedOpening: problem.scriptedOpening ? problem.scriptedOpening.map((trick) => [...trick]) : undefined,
    source: problem.source ? { ...problem.source } : undefined
  };
}

export const experimentalDraft01 = cloneProblem(ruffOrSluff02, 'experimental_draft_01');
export const experimentalDraft01a = cloneProblem(ruffOrSluff01, 'experimental_draft_01a');
export const experimentalDraft01b = cloneProblem(ruffOrSluff01c, 'experimental_draft_01b');
