# `main.ts` Split Tentative Plan

## Purpose

This note records a practical plan for splitting `src/demo/main.ts` into a small cluster of app-coordinator files.

It does **not** assume that the coordinator layer should become small.

The goal is:

- better separation of top-level concerns
- less accidental coupling inside one monolithic file
- easier reasoning about the app shell

The goal is **not**:

- shrinking `main.ts` for its own sake
- splitting by visible surface
- resuming broad refactor work without a concrete product reason

## Current Reality

`src/demo/main.ts` is currently about 6.9k lines.

That size by itself is not the core problem.

The more important problem is that the file still carries multiple top-level coordinator responsibilities at once:

- bootstrap and URL setup
- top-level mutable app/session state
- article-script coordination
- practice/profile/assist coordination
- gameplay/apply/autoplay/hint orchestration
- logging/debug/snapshot helpers
- large DOM render assembly
- startup/replay/checkpoint flows

Even if lower layers continue to improve, the app coordinator will likely remain large.

So the right target is not "make it small."

The right target is:

- one app coordinator layer
- expressed through a few files instead of one

## Why It Has Not Been Shrinking Much

Recent extractions already moved real lower-level concerns out:

- interaction policy
- hand-diagram session
- settings-panel session
- shared hand-diagram navigation

That means the remaining bulk is not just "forgotten helpers."

A lot of what remains is legitimate app-coordinator work.

So future improvement should come from splitting coordinator families, not from expecting endless extractions below the coordinator to collapse the file.

## Current Clusters Inside `main.ts`

Approximate responsibility clusters today:

### 1. Bootstrap, URL parsing, initial mode/problem setup

Rough areas:

- `DisplayMode`, `WidgetUiMode`, initial URL-derived flags and ids
- startup configuration for widget/practice/article
- initial problem/script/checkpoint/user-history setup

Representative areas:

- roughly lines `290-450`
- problem resolution helpers around `1170-1200`

### 2. Article-script coordination

Rough areas:

- article-script replay/matching helpers
- article-script state interpretation
- branch/progress helpers
- script-profile defaults
- checkpoint reset / script reset / replay-to-cursor flows
- script companion-panel selection

Representative areas:

- roughly lines `453-1170`
- roughly lines `6773-6855`

### 3. Top-level mutable app/session state

Rough areas:

- engine state
- replay data
- assist/profile state
- practice session state
- narration/hint/error/debug state
- timers and replay caches

Representative area:

- roughly lines `1200-1415`

### 4. Assist, settings, and practice/profile orchestration

Rough areas:

- assist-level resolution and application
- settings toggle rendering/wiring
- widget/procedure defaults
- practice run/session transitions
- claim/concede/terminal scoring posture

Representative areas:

- roughly lines `1555-1895`
- roughly lines `2900-3125`

### 5. Gameplay/apply/autoplay/hints/snapshots/logging

Rough areas:

- hint and DD-error classification
- move execution
- snapshot/undo handling
- autoplay/singleton flows
- teaching/log generation
- run-status transitions
- problem reset/select flows

Representative areas:

- roughly lines `1928-5408`

This is the largest and riskiest cluster.

### 6. DOM render assembly

Rough areas:

- card/table/status rendering
- analysis/practice/widget framing
- companion panel rendering
- debug and teaching panes
- root render orchestration

Representative areas:

- roughly lines `5409-6495`

### 7. Startup/replay completion flows

Rough areas:

- replay initial history
- launch startup opening
- replay article script to cursor
- checkpoint reset and full reset-to-beginning

Representative areas:

- roughly lines `6659-6876`

## Main Architectural Conclusion

`main.ts` is not one file with "too many helper functions."

It is several app-coordinator families living in one file.

That means the split should be:

- by coordinator concern
- not by syntax
- not by surface

## What Not To Do

### Do not split by surface first

Avoid a first move like:

- `articleMain.ts`
- `practiceMain.ts`
- `workbenchMain.ts`

Why:

- it encourages surface ownership of behavior
- it fights the architecture you have been building
- many of the current concerns are shared across surfaces even when only one surface exposes them visibly

### Do not combine the split with a re-tree

Do not simultaneously:

- split `main.ts`
- move everything into new folders
- rename `src/demo`

That is too much churn at once.

If this work happens soon, the split should happen first with files staying near `main.ts`.

Later, if the `src/demo` subtree plan becomes worth doing, those files can move again with much less ambiguity.

### Do not chase line count as the success metric

The metric is:

- clearer coordinator boundaries
- easier reasoning about ownership
- lower conflict when adding features

Not:

- "did `main.ts` fall below N lines?"

## Recommended Target Shape

If this split happens soon, the likely near-term shape should stay flat under `src/demo`, for example:

- `src/demo/main.ts`
- `src/demo/articleScriptCoordinator.ts`
- `src/demo/appRender.ts`
- `src/demo/appGameplay.ts`

Potential later move:

- into `src/demo/app/*` once the internal split has proven itself

This avoids combining a file split with a directory migration.

## Recommended Responsibilities

### `main.ts`

Should become the composition root and bootstrap entry.

It should still own:

- top-level imports
- startup/bootstrap order
- creation of shared mutable app state
- wiring together coordinator modules
- final boot sequence

It should stop owning every detailed flow.

### `articleScriptCoordinator.ts`

Should own article-script-specific orchestration that is above pure runtime/policy but below page framing.

Likely contents:

- script replay/matching helpers that currently depend on app state
- script progress/branch/projection helpers
- script-profile default application
- checkpoint reset / reset-to-beginning / replay-to-cursor
- current script companion-panel resolution

Why this seam is attractive:

- it already exists as a coherent cluster
- active DD1/scripted-solution work will otherwise keep growing this region
- it aligns with a concrete current product need

### `appRender.ts`

Should own large DOM assembly and page/widget composition.

Likely contents:

- render helpers for board/status/controls/debug/teaching
- companion panel rendering
- practice header/state bar rendering
- root `render()` assembly

Important:

- `appRender.ts` would still call shared modules like `handDiagramNavigation`
- it should not absorb control policy
- it should remain an app/render coordinator, not a new semantic owner

### `appGameplay.ts`

Should own gameplay/apply/autoplay/hint/snapshot orchestration that currently sits between engine/runtime and UI.

Likely contents:

- `runTurn`
- reset/select-problem flows that must coordinate engine/app state
- hint/DD-error classification entry points
- autoplay advancement
- snapshot/undo helpers
- run-status transition helpers

This is probably the biggest file after extraction.

It is also the riskiest seam, so it should not be first.

## Extraction Order

### Step 1: Extract `articleScriptCoordinator.ts`

This is the best first step.

Reason:

- it is already a visible coordinator family
- it aligns with current scripted DD1/product work
- it reduces the chance that future script work keeps accreting inside `main.ts`
- it can be extracted without redefining the whole app shell

Desired shape:

- a factory/module that receives the app dependencies it needs
- returns script-coordinator functions used by the composition root

Avoid:

- introducing a giant class just to move code
- pushing script behavior back into surface/render modules

### Step 2: Extract `appRender.ts`

This is likely the second step, not the first.

Reason:

- it is a large, visually coherent chunk
- it is easier to separate once article-script-specific render dependencies are a bit clearer

Caution:

- render code touches many globals today
- a direct extraction will likely need a dependency bag/factory seam
- do not replace one monolith with a render module that owns half the app's behavior

### Step 3: Extract `appGameplay.ts`

This should happen only if there is concrete pain in the gameplay/apply/autoplay/logging region.

Reason:

- it is structurally valid
- but it is the highest-risk split because it touches the most stateful transitions

If done, the boundary must stay at the app-coordinator level, not leak engine semantics upward or UI semantics downward.

### Step 4: Reassess practice/profile/assist coordination

After the first two splits, reassess whether remaining `main.ts` bulk needs another seam such as:

- `practiceCoordinator.ts`
- `profileAssistCoordinator.ts`

This should happen only if that cluster remains painful.

It may turn out that after script/render splits, the remaining coordinator is acceptable.

## Implementation Style

### Prefer factory-style module seams

The split should probably use modules/functions like:

- `createArticleScriptCoordinator(deps)`
- `createAppRender(deps)`
- `createAppGameplay(deps)`

Rather than:

- moving a few hundred free functions and then passing enormous argument lists everywhere
- introducing an oversized app class without necessity

Why:

- current `main.ts` behavior depends heavily on shared mutable top-level app state
- factory seams preserve that reality without pretending the state model is already cleaner than it is
- this supports an incremental split

### Keep state ownership explicit

Even with factory-style seams:

- policy stays policy
- session stays session
- shared hand-diagram layout stays shared hand-diagram layout
- surface framing stays surface framing

The new files are still part of the app coordinator layer.

They are not excuses to reassign ownership downward.

## Recommendation: Implement Now Or Hand Off?

Recommendation:

- do **not** implement this split opportunistically in the current thread
- treat this as a planned future refactor tied to concrete product work

More specific recommendation:

- the next thread that meaningfully expands scripted solution/DD1 behavior is the right place to start Step 1
- do not start with `appGameplay.ts`
- do not start with a broad all-at-once `main.ts` breakup

Reason:

- this split touches the app shell
- the file is already active and likely to be touched by other ongoing work
- a coordinator split is best done when one seam is being exercised by a real feature, not as tree cleanup

## Practical Next Trigger

The most likely trigger for Step 1 is:

- more DD1 or scripted solution-viewing work that would otherwise add another significant slice of article-script orchestration into `main.ts`

At that point, extract `articleScriptCoordinator.ts` first and stop.

Then evaluate whether the new boundary genuinely improves the file before taking the next step.
