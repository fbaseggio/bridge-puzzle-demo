import { describe, expect, it } from 'vitest';
import {
  canGuidedAdvanceByProfile,
  isSolutionViewingProfile,
  resolveNonStandardPracticeAssistToggles,
  resolveStandardPracticeAssistLevel,
  shouldRevealDdErrorAlternatives,
  shouldScorePracticeProfile
} from '../../src/demo/interactionProfiles';

describe('interaction profile policy', () => {
  it('enables guided advance outside puzzle-solving', () => {
    expect(canGuidedAdvanceByProfile('puzzle-solving')).toBe(false);
    expect(canGuidedAdvanceByProfile('story-viewing')).toBe(true);
    expect(canGuidedAdvanceByProfile('solution-viewing')).toBe(true);
  });

  it('maps practice scoring and standard assist by profile', () => {
    expect(shouldScorePracticeProfile('puzzle-solving')).toBe(true);
    expect(shouldScorePracticeProfile('solution-viewing')).toBe(false);
    expect(resolveStandardPracticeAssistLevel('puzzle-solving')).toBe('puzzle');
    expect(resolveStandardPracticeAssistLevel('solution-viewing')).toBe('solution');
  });

  it('maps non-standard assist toggles by profile', () => {
    expect(resolveNonStandardPracticeAssistToggles('puzzle-solving')).toEqual({
      alwaysHint: false,
      narrate: false,
      cardColoring: false
    });
    expect(resolveNonStandardPracticeAssistToggles('solution-viewing')).toEqual({
      alwaysHint: true,
      narrate: true,
      cardColoring: true
    });
    expect(isSolutionViewingProfile('solution-viewing')).toBe(true);
    expect(isSolutionViewingProfile('story-viewing')).toBe(false);
  });

  it('suppresses DD-error alternative reveal in puzzle-solving only', () => {
    expect(shouldRevealDdErrorAlternatives('puzzle-solving')).toBe(false);
    expect(shouldRevealDdErrorAlternatives('story-viewing')).toBe(true);
    expect(shouldRevealDdErrorAlternatives('solution-viewing')).toBe(true);
  });
});
