export type WidgetStartupMode = 'default' | 'single-step';

export type AdvanceWidgetStartupFromScriptInput = {
  mode: WidgetStartupMode;
  startupOpeningLength: number;
  advanceOneWidgetCard: () => boolean;
};

export function advanceWidgetStartupFromScript(
  input: AdvanceWidgetStartupFromScriptInput
): number {
  const targetAdvances = input.mode === 'single-step'
    ? Math.min(1, Math.max(0, input.startupOpeningLength))
    : Math.max(0, input.startupOpeningLength);
  let advanced = 0;
  for (let i = 0; i < targetAdvances; i += 1) {
    if (!input.advanceOneWidgetCard()) break;
    advanced += 1;
  }
  return advanced;
}
