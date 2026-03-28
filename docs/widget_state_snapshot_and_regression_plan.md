# Widget State Snapshot And Regression Plan

## Purpose

This note defines a plan for:

- serializing widget state
- sharing or debugging widget state outside the running page
- building stronger article/widget regression tests

The immediate user-facing motivations are:

1. When an article has been carefully tuned, we want a thorough regression pack so later work does not silently drift its behavior.
2. We want a fast way to extract the current widget state for debugging.
3. We may want a user-shareable URL that opens a page with just the widget in its current state.

This plan is intentionally broader than a single keyboard shortcut or a single test file.

The real need is a canonical, testable model of widget state.

## Main Architectural Thesis

The share/debug/export problem and the regression-test problem are the same problem.

Both want:

- a canonical state model for the widget experience
- a deterministic way to restore or replay into that state

So the right direction is not:

- add one ad hoc debug command
- add one more UI integration test

The right direction is:

- define a widget state snapshot model
- build serialization/export on top of it
- build regression scenarios on top of it

## Why This Is Architecturally Useful

This work should create productive refactor pressure.

The first implementation should snapshot what fits naturally today.

Anything that does **not** fit naturally is valuable diagnostic information:

- if it is important but hard to snapshot, it is probably not explicitly modeled enough
- if it is only recoverable through DOM state or local variables, it likely belongs in session or initial config
- if a control click result is hard to express without rendering, the interaction model is probably too implicit

So this plan should not trigger one giant refactor up front.

Instead:

- Phase 1: serialize what is already explicit
- Phase 2: note the awkward parts
- Phase 3: treat those awkward parts as a backlog of small boundary-improving refactors

## Current State Reality

The app already has some serializable state and startup inputs:

- problem id
- variant id
- mode / widget UI mode
- user history
- scripted opening
- startup gate flag
- article script id
- article checkpoint id
- reading-profile URL flag
- companion-panel URL flag

The app also already has explicit session/coordinator state in useful places:

- article-script coordinator state
- practice interaction profile
- assist level by puzzle mode
- hand-diagram reading reveal stage
- companion-panel hidden state
- hand-diagram branch/progress tracking

This is a good starting point.

## First Implementation Slice

The first slice should be intentionally narrow.

It should target:

- widget-mode experiences
- especially article-scripted widgets such as VSC and DD1
- reading/story/profile states that are already visible product concerns

It should **not** try to cover everything at once.

In particular, the first slice should avoid trying to fully solve:

- practice-set/session reproduction
- analysis-page debug panes and full log state
- every current toggle and transient internal diagnostic at permalink quality

Why this is the right first slice:

- the user-facing share/debug need is strongest for article widgets
- article-script state is now explicit enough to serialize cleanly
- reading-profile chrome state is now explicit enough to serialize cleanly
- practice and analysis carry more coordinator-specific state and would add churn too early

So the near-term target should be:

- reopen a widget in meaningfully the same story/puzzle state
- copy a widget URL for debugging or sharing
- build curated regression scenarios for finished article widgets

Practice and broader analysis restoration can follow later if the same model proves useful there.

## Natural Vs. Awkward State Today

This is the most important planning distinction.

### State that fits naturally today

These are already explicit enough that they should be part of the first snapshot pass:

- problem id / variant id / seed
- display mode and widget UI mode
- article script id / checkpoint id / cursor / history
- article script choice selections
- article script interaction profile override
- reading-profile enablement and current reveal stage
- reading interaction-started state
- companion-panel enablement and current hidden state
- assist level by puzzle mode

### State that is probably canonical but still awkward

These should be attempted in the first pass, but they may turn into follow-on refactor tasks:

- binary assist overrides such as narration, card coloring, hide-East-West, and similar toggles
- startup gate / startup-sequence current state
- current active profile when it is derived from several places rather than stored in one resolved value
- non-scripted widget replay state outside the current article-script path

### State that should remain debug-only at first

These materially help debugging, but they do not all belong in the first public/shareable snapshot contract:

- current message/status payload
- current companion payload
- branch-progress summaries
- hint/error visuals
- dismissed outcome state
- visible control summaries

### Redundant helper state

Some current fields look useful for debugging but should not become required canonical snapshot fields if they are derivable from a smaller source of truth.

Examples:

- `readingControlsRevealed`
- `readingQuietControlsEntered`

For shareable state, the canonical value is probably just:

- `readingControlsRevealStage`

The helper booleans may still belong in debug dumps if they are useful while the current implementation continues to use them.

## Important State Categories

The snapshot model should distinguish several layers instead of flattening everything together.

### 1. Widget initial config

This is the immutable per-instance startup nudge.

Examples:

- start in reading-profile
- widget UI mode
- companion panel capability
- startup gate enabled
- preferred initial profile

This is where surface/article should influence startup.

Surface should be allowed to provide this initial bias.

Surface should **not** own ongoing control semantics after initialization.

### 2. Problem snapshot

This is the current underlying problem/runtime state relevant to reproducibility.

Examples:

- problem id
- variant id
- seed
- user history / replay history
- current engine-derived position after replay
- article script id / checkpoint / cursor
- choice selections

This is the closest thing to "what position are we actually in?"

### 3. Journey state

This is the current interaction posture.

Examples:

- active interaction profile
- current assist level
- user override toggles
- whether the user has moved away from the default journey

This is not surface framing.

It is the active user-facing interaction contract.

### 4. Widget chrome state

This is local widget UI state that affects how the experience is presented.

Examples:

- reading reveal stage (`collapsed` / `quiet` / `full`)
- whether interaction has started
- tools drawer / advanced-controls drawer state
- companion panel hidden/open state
- settings panel state when relevant

This should be testable independently of final rendering.

### 5. Debug-only transient state

This includes information useful for internal debugging but not necessarily required for restoration.

Examples:

- current status message
- dismissed outcome key
- current companion content payload
- hint/error visuals
- branch-progress summaries

This can live in a debug export without all of it becoming part of the canonical shareable permalink.

## Proposed Snapshot Types

The system should support two related but distinct output shapes.

### A. Restorable widget snapshot

Purpose:

- deterministic restore
- shareable links
- regression tests

This should include only state that matters to reopening the experience in a meaningfully equivalent state.

Suggested shape:

```ts
type WidgetStateSnapshotV1 = {
  version: 1;
  problem: {
    problemId: string;
    variantId: string | null;
    seed: number;
  };
  initialConfig: {
    displayMode: 'widget' | 'practice' | 'analysis';
    widgetUiMode?: 'default' | 'dd-puzzle' | 'sd-puzzle';
    readingProfile?: boolean;
    companionPanelEnabled?: boolean;
    startupGate?: boolean;
  };
  runtime: {
    userHistory: CardId[];
    scriptedOpening?: CardId[];
  };
  articleScript?: {
    scriptId: string;
    checkpointId: string | null;
    initialCursor: number;
    cursor: number;
    history: CardId[];
    choiceSelections: Record<number, CardId>;
    interactionProfileOverride: InteractionProfile | null;
  };
  journey: {
    activeProfile?: InteractionProfile;
    assistLevelByPuzzleMode?: Partial<Record<string, string>>;
    practiceInteractionProfile?: 'puzzle-solving' | 'solution-viewing';
    overrideToggles?: {
      alwaysHint?: boolean;
      narrate?: boolean;
      cardColoringEnabled?: boolean;
      hideEastWest?: boolean;
    };
  };
  chrome: {
    readingControlsRevealStage?: 'collapsed' | 'quiet' | 'full';
    readingInteractionStarted?: boolean;
    companionPanelHidden?: boolean;
  };
};
```

This exact shape should be treated as directional, not final.

### B. Debug widget dump

Purpose:

- internal debugging
- copying state back into an architecture/debug thread

This may include everything in the restorable snapshot plus transient/debug-only state.

Suggested additions:

- current status payload
- current companion content
- branch-progress summaries
- hint/error state
- dismissed outcome key
- visible control-state summary

This dump does **not** need to be stable for public sharing in the same way as the permalink snapshot.

## Restoration Principle

The system should restore widget state by:

- reconstructing startup configuration
- restoring session/coordinator state
- replaying into the intended position

It should **not** try to restore shareable widget state by dumping or reusing the app's internal engine undo snapshot.

That internal snapshot system is useful for undo and coordinator internals, but it is the wrong abstraction for:

- user-shareable widget links
- stable article regression fixtures
- product-level debugging

So the design rule should be:

- restorable widget snapshots are product-state snapshots
- undo snapshots remain engine/app coordinator internals

## Shareable URL Plan

The shareable URL should be built from the restorable snapshot, not from the debug dump.

### User goal

A user should be able to send:

- one URL

and the recipient should be able to open:

- a widget-only page
- in essentially the same meaningful state

### Recommendation

Add one canonical widget-share route or mode built around the same app entry:

- existing widget mode is probably enough as the first destination
- later, a more intentional widget-only route may make sense

The URL should encode either:

- compact query params for the small stable subset
- or one versioned snapshot payload in query/hash form if the state grows beyond reasonable param sprawl

Near-term recommendation:

- keep using readable query params for things that already map cleanly
- add one snapshot payload only when the current param model becomes too awkward

Do not introduce a large opaque blob prematurely if the current state still maps cleanly to explicit params.

## Keyboard / Export Commands

We should support two export actions built from the same serializer:

### 1. Copy widget link

Purpose:

- user-shareable
- product-facing debugging

Output:

- shareable widget URL

### 2. Copy widget debug state

Purpose:

- internal debugging
- paste into chat or issue reports

Output:

- richer JSON/debug dump

### Keyboard affordance

The exact shortcut does not need to be fixed in this plan.

But the interaction should be:

- quick
- available without navigating away
- clearly differentiated between "shareable link" and "debug dump"

If the keyboard command is not discoverable enough, it should also be reachable from a small debug/tools affordance.

## Regression Strategy

### Goal

When an article/widget has been tuned and shipped, it should have a curated regression pack that protects the intended experience.

This should not depend only on screenshots.

### Recommended test layers

#### 1. State-machine / interaction-model tests

These test event-to-state transitions without requiring final rendering.

Examples:

- reveal stages
- quiet/full controls transitions
- profile transitions
- `next` / `nextPause` behavior under different problem/journey states
- prompt-vs-choose behavior

#### 2. Snapshot serializer/deserializer tests

These verify:

- the snapshot captures the intended state
- restoring from it returns to an equivalent experience state
- shareable URL encoding/decoding is stable

#### 3. Curated article scenario tests

These should be the main protection against article drift.

Each finished article/widget gets a curated scenario pack that exercises:

- initial state
- first reveal(s)
- key story beats
- important forks / choice points
- off-guided or off-script behavior where relevant
- profile transitions such as puzzle -> solution when relevant
- reset/replay paths

These tests should assert model-level state, not just DOM.

Examples of assertions:

- active profile
- reveal stage
- script state id
- branch progress
- companion state
- current enabled controls
- current cursor / choice selections

#### 4. A few visual tests

Visual tests still matter for layout, but should be the last layer, not the main layer.

Use them for:

- layout sanity
- visual drift in key article states

Not for:

- most event-model semantics

## Recommended Implementation Order

### Phase 0: Fix the scope and first restore target

Start with one well-bounded target:

- widget mode
- article-scripted widgets first
- restore into the same meaningful widget experience state

Do not try to make the first implementation be:

- a universal all-surface serializer
- a practice queue/session restorer
- a raw engine-state dumper

This scoping decision is what keeps the work architecture-improving instead of sprawling.

### Phase 1: Define a minimal canonical snapshot model

Build a first `WidgetStateSnapshotV1` around what already fits naturally.

Do **not** block on every missing piece becoming explicit first.

Near-term fields that should fit naturally:

- problem id / variant / seed
- display mode / widget UI mode
- article script id / checkpoint / history / cursor / choice selections
- interaction profile override
- assist-level-by-mode
- reading reveal stage
- reading interaction-started state
- companion panel hidden state
- user history

Near-term fields that should remain out of the first permalink contract unless they prove necessary:

- redundant reading helper booleans
- full transient status/message payloads
- hint/error visuals
- raw debug pane / semantic reducer state

### Phase 2: Add serializer + restore entry point

Create:

- snapshot export
- snapshot restore

Initially this may just restore through existing startup params and app/session mutation.

That is acceptable as a first step.

The important point is that restore should be deterministic and testable, even if the first implementation still passes through existing coordinator entry points.

### Phase 3: Add export actions

Add:

- copy shareable widget link
- copy debug state

Both should use the same underlying snapshot source.

### Phase 4: Add a widget/article regression harness

Build a scenario runner that can:

- start from initial config or a snapshot
- dispatch widget events
- assert resulting state

This is the point where the missing interaction-state seam will become most visible.

### Phase 5: Add curated scenario packs for completed articles

Do this article by article.

These should be opt-in and curated, not automatically generated from every reachable state.

## Refactor Pressure Expected From This Work

This effort should expose a set of small, concrete refactor opportunities.

Likely examples:

### 1. Widget initial config is still too implicit

If startup bias is hard to snapshot or restore, it probably belongs in a more explicit `WidgetInitialConfig`.

### 2. Journey state is not fully explicit

If active profile/assist/journey steps are hard to serialize, the journey model probably needs a clearer session representation.

### 3. Widget chrome state is too DOM-coupled

If reveal stages or tool drawers are hard to restore without rendering hacks, widget chrome state needs better explicit session ownership.

### 4. Control-event semantics are too implicit

If "clicking this button should do X" is hard to test without full DOM rendering, the app needs a more explicit interaction-state model or widget state machine.

### 5. Some state is transient but still product-significant

If a state materially changes the experience but is currently impossible to serialize cleanly, it probably should not remain an unnamed local.

These are exactly the kinds of small boundary improvements we want this plan to surface.

## Current Concrete Friction Points

Based on the current code shape, I would expect the first snapshot pass to press on these specific seams:

### 1. Assist state is still split between preset level and individual toggles

`assistLevelByMode` is explicit, but several binary controls still live as separate top-level coordinator variables.

That is acceptable for the first pass, but if the resulting snapshot feels awkward, the follow-up should be a small resolved-assist-state seam, not a broad control refactor.

### 2. Companion visibility is canonical widget chrome but still top-level coordinator state

`widgetCompanionPanelHidden` looks like real widget chrome state.

If serialization/restoration around companion visibility feels awkward, that is a good argument for moving it into a more explicit widget/session-owned state holder later.

### 3. Startup posture is partly explicit and partly derived

The startup experience currently depends on a mix of:

- URL/startup inputs
- `readingStoryJourneyEnabled()`
- `startPending`

If reproducing "what the user first sees" feels awkward, the follow-up should be to make `WidgetInitialConfig` and startup posture more explicit, not to special-case export logic.

### 4. Non-scripted replay state is not yet the clean first target

There is already article-script replay machinery that is explicit enough to drive restoration.

Generic non-scripted widget history may follow, but it should not be allowed to complicate the first share/debug implementation.

## Relationship To Current Architecture

This plan should respect the existing ownership model:

- surface provides startup framing and initial config nudges
- profile/puzzle-type/session define interaction semantics
- shared hand-diagram layout defines shared geometry
- script/runtime defines authored progression state

The snapshot system should reflect those boundaries rather than collapsing them.

## Suggested Future Modules

These are conceptual seams, not an immediate file-creation mandate.

Potential future modules:

- `widgetStateSnapshot.ts`
- `widgetStateSnapshotUrl.ts`
- `widgetDebugExport.ts`
- `widgetScenarioHarness.ts`
- later, if needed:
  - `widgetInteractionStateMachine.ts`

The important point is that serialization and regression should share the same underlying state model.

## What To Avoid

- do not start with a giant all-state serializer that tries to capture every ephemeral detail
- do not tie snapshot meaning to current DOM structure
- do not make shareable URL and internal debug dump two unrelated systems
- do not rely on visual tests alone to validate interaction behavior
- do not refactor broadly before the first snapshot pass reveals which state is actually awkward

## Initial Recommendation

The best first implementation step is:

1. define `WidgetStateSnapshotV1`
2. serialize what already fits naturally
3. add debug export + shareable link generation
4. then use the awkward parts as a guide for targeted follow-on refactors

This keeps the work concrete, valuable, and architecture-improving without turning it into refactor hunger.
