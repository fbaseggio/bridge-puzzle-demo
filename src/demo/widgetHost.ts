import type { CardId, Problem, State } from '../core/types';
import type { apply, init } from '../core/engine';
import type { ArticleScriptSpec } from './articleScripts';
import type { replayArticleHistory } from './articleScriptRuntime';
import type { DdsQueryInput, DdsQueryResult } from '../ai/ddsBrowser';

/** Opt-in host runtime, used by the local Random experiment. */
export type WidgetDdsRuntime = {
  ensure: () => Promise<boolean>;
  status: () => 'idle' | 'loading' | 'ready' | 'failed';
  query: (input: DdsQueryInput) => DdsQueryResult;
  retry: () => Promise<boolean>;
  failure: (reason: string, detail?: string) => void;
  controlsReady?: (retry: () => Promise<boolean>) => void;
  unavailableMessage?: () => string;
};

export type WidgetPracticeSettings = {
  assist:'puzzle'|'light'|'guided'|'solution';
  autoplaySingletons:boolean; autoplayEw:boolean; hideEastWest:boolean;
  cardColoring:boolean; alwaysHint:boolean; narrate:boolean; alertMistakes:boolean; showGuides:boolean;
};

export type WidgetClaimResult = { accepted: boolean; message: string };

/** Optional bootstrap input for a transient position, independent of the catalog. */
export type WidgetHost = {
  problem: Problem;
  /** Host-owned next-deal action for the double-chevron control. */
  onNextDeal?: () => void;
  /** Supplying a runtime makes DDS mandatory for assisted play in this host. */
  dds?: WidgetDdsRuntime;
  exploration?: boolean;
  /** Allow optional E/W autoplay while retaining manual exploration defaults. */
  explorationAutoplay?: boolean;
  /** Inherit this browser's site-wide display and play defaults. */
  inheritSitePreferences?: boolean;
  /** The outer host owns diagram scaling, as Movie does. */
  externalDiagramZoom?: boolean;
  /** Start an embedded puzzle with Practice assistance and autoplay defaults. */
  practice?: boolean;
  /** Opt-in claim adjudication for an embedded host; shared UI handles completion. */
  evaluateClaim?: (state: State) => WidgetClaimResult;
  practiceSettings?: WidgetPracticeSettings;
  onPracticeSettingsChange?: (settings:WidgetPracticeSettings)=>void;
  /** Optional consumer preference, called only with DDS-optimal defender cards. */
  preferDefenderCards?: (state: State, candidates: readonly CardId[]) => readonly CardId[];
  engine?: { init: typeof init; apply: typeof apply };
  articleScript?: ArticleScriptSpec;
  hideCompanionPanel?: boolean;
  replayHistory?: typeof replayArticleHistory;
  onRender?: (state: State, trickFrozen: boolean) => void;
};

declare global { interface Window { dsWidgetHost?: WidgetHost } }
export function readWidgetHost(): WidgetHost | undefined {
  return typeof window === 'undefined' ? undefined : window.dsWidgetHost;
}
