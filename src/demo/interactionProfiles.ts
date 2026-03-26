export type InteractionProfile = 'story-viewing' | 'puzzle-solving' | 'solution-viewing';

export type PracticeInteractionProfile = Extract<InteractionProfile, 'puzzle-solving' | 'solution-viewing'>;

export type PracticeAssistToggles = {
  alwaysHint: boolean;
  narrate: boolean;
  cardColoring: boolean;
};

export function canGuidedAdvanceByProfile(profile: InteractionProfile): boolean {
  return profile !== 'puzzle-solving';
}

export function isSolutionViewingProfile(profile: InteractionProfile): boolean {
  return profile === 'solution-viewing';
}

export function shouldScorePracticeProfile(profile: PracticeInteractionProfile): boolean {
  return profile === 'puzzle-solving';
}

export function resolveStandardPracticeAssistLevel(profile: PracticeInteractionProfile): 'puzzle' | 'solution' {
  return profile === 'solution-viewing' ? 'solution' : 'puzzle';
}

export function resolveNonStandardPracticeAssistToggles(profile: PracticeInteractionProfile): PracticeAssistToggles {
  if (profile === 'solution-viewing') {
    return { alwaysHint: true, narrate: true, cardColoring: true };
  }
  return { alwaysHint: false, narrate: false, cardColoring: false };
}
