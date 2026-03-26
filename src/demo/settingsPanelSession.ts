export type SettingsPanelContext = 'analysis' | 'practice' | 'widget';

export type SettingsPanelSession = {
  context: SettingsPanelContext | null;
  nestedOptionsOpen: boolean;
  outsideDismissBound: boolean;
};

export function createSettingsPanelSession(): SettingsPanelSession {
  return {
    context: null,
    nestedOptionsOpen: false,
    outsideDismissBound: false
  };
}

export function closeSettingsPanel(session: SettingsPanelSession): void {
  session.context = null;
  session.nestedOptionsOpen = false;
}

export function toggleSettingsPanel(session: SettingsPanelSession, context: SettingsPanelContext): void {
  if (session.context === context) {
    closeSettingsPanel(session);
    return;
  }
  session.context = context;
  session.nestedOptionsOpen = false;
}

export function setSettingsNestedOptionsOpen(session: SettingsPanelSession, open: boolean): void {
  session.nestedOptionsOpen = open;
}
