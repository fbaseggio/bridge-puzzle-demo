import {
  apply,
  type EngineEvent,
  type Play,
  type Seat,
  type SemanticEventCollector,
  type State
} from '../core';

const FORCED_SCRIPTED_OPENING_USER_CONTROLS: Seat[] = ['N', 'E', 'S', 'W'];

export function applyWidgetScriptedOpeningStep(input: {
  state: State;
  play: Play;
  eventCollector?: SemanticEventCollector;
}): { state: State; events: EngineEvent[] } {
  const originalUserControls = [...input.state.userControls];
  const steppedState: State = {
    ...input.state,
    userControls: FORCED_SCRIPTED_OPENING_USER_CONTROLS
  };
  const result = apply(
    steppedState,
    input.play,
    input.eventCollector ? { eventCollector: input.eventCollector } : undefined
  );
  return {
    state: { ...result.state, userControls: originalUserControls },
    events: result.events
  };
}
