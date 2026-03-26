# Hand Diagram And Session Refactor Plan

## Purpose

This note turns the recent refactor work into a concrete follow-on plan.

It is meant to answer:

- what `main.ts` still owns
- what should move next
- which geometry and behavior responsibilities should be shared
- how to continue cleaning up without destabilizing VSC, DD1, or practice

This is a planning note only. It does not propose changing product behavior immediately unless explicitly called out.

## Current State

### Shared script behavior

We now have a small extracted policy layer in:

- `src/demo/articleScriptInteractionPolicy.ts`

This module currently owns pure decisions for article-script interaction such as:

- branch option choice by interaction profile
- recursive authored branch completion
- previous unfinished branch lookup
- whether scripted user advance should block
- explicit branch `>` behavior
- remembered-tail replay gate
- scripted defender autoplay gate

This is good progress. It gives us a real policy seam and tests for it.

### Shared hand-diagram navigation

We also now have:

- `src/demo/handDiagramNavigation.ts`

This module renders:

- status / outcome area
- transport row
- practice-specific secondary actions
- reading-profile reveal edge

This is the first shared consumer of the new interaction-policy layer.

### Remaining app coordinator

`src/demo/main.ts` is still large and still owns too much.

Current size:

- `main.ts`: about 6.3k lines

What it still mixes together:

- app bootstrap
- URL parsing
- problem selection
- practice session state
- article-script session state
- widget transient status state
- replay / cache helpers
- autoplay timers
- settings / assist defaults
- rendering orchestration
- many small derived-state helpers

This is still too much for one module, even after the recent extractions.

## Working Architecture

The current architecture direction now looks like this:

1. Engine
2. Problem definition
3. Authored behavior / script data
4. Script runtime
5. Interaction policy
6. Session state
7. Hand diagram module
8. Surface frame
9. App coordinator

This stack is now useful enough that implementation should start conforming to it more deliberately.

## Core Boundaries

### Engine

Should own:

- legal plays
- applying plays
- trick completion
- winner / turn updates
- objective bridge state

Should not own:

- UI behavior
- script posture
- interaction profile
- scoring posture

### Script runtime

Should own:

- matching history to script
- replaying scripted cards
- deriving `pre / in / off / post`
- reconstructing branch selections

Should not own:

- widget prompts
- transport button semantics
- article/profile presentation choices

### Interaction policy

Should own pure decisions about how script-aware controls behave under a given profile.

Examples:

- should `>` block at this scripted user turn?
- should first `>` prompt or choose?
- which authored branch option is preferred?
- should autoplay pause here?
- should remembered history replay be allowed through this cursor?

Should not own:

- DOM
- timers
- mutable session state
- actual play execution

### Session state

Should own run-specific mutable state such as:

- history
- undo memory
- branch completion
- tried branch options
- hint / mistake counts
- transient widget messages
- reading reveal state
- autoplay timers / handles

Right now this is the least explicit layer. It exists mostly as loose mutable state in `main.ts`.

### Hand diagram module

Should own the shared diagram-adjacent UI contract:

- outcome/status slot
- transport row slot
- reveal edge slot
- control-row geometry
- diagram-to-status spacing

And should consume:

- interaction policy
- session state
- callbacks for actual actions

This module should not own:

- global app routing
- practice header/frame
- URL mutation
- problem queue management

### Surface frame

Should own only outer framing.

Examples:

- practice set header and progress strip
- article body and surrounding prose
- workbench debug scaffolding

It should not own transport semantics or diagram geometry.

That is the main lesson from the recent practice-layout regression.

## Near-Term Goals

### Goal 1: Keep one shared hand-diagram layout model

The status bar / controls / diagram relationship should be shared across:

- article widget
- practice
- workbench where possible

Only the outer frame should differ by surface.

This is now partially true again after the recent practice cleanup, and should be protected.

### Goal 2: Make `main.ts` less stateful by accident

The next cleanup should not just move rendering around.

It should make session ownership more explicit so future VSC / DD1 / reading-profile changes stop re-accumulating in `main.ts`.

### Goal 3: Preserve the good current behaviors

Do not reopen the following unless intentionally working on them:

- VSC story-viewing behavior
- DD1 puzzle-solving behavior
- shared status/message layout
- reading reveal edge baseline
- shared practice/article diagram geometry

## Recommended Next Extraction Order

### Step 1: Define a session helper boundary

Create a small session-oriented helper module for hand-diagram interaction state.

Candidate name:

- `src/demo/handDiagramSession.ts`

Initial scope:

- widget status helpers
- dismissible outcome key handling
- reading reveal state
- branch completion / tried-option mutable maps
- follow-prompt cursor / sticky-message state

This should start as a thin state helper, not a large class.

Reason:

- many of the remaining `main.ts` globals are session, not app bootstrap
- the current distinction between “policy” and “session” is the next important cleanup boundary

### Step 2: Split transport wiring from outcome rendering inside `handDiagramNavigation.ts`

Current module is still a controller-heavy bundle.

The next seam is already visible:

- outcome/status rendering
- transport/action rendering

Suggested internal split:

- `renderOutcomeModule(...)`
- `renderTransportRow(...)`
- `renderPracticeSecondaryActions(...)`
- `renderReadingRevealEdge(...)`

This does not require new behavior. It only makes the module easier to reason about.

### Step 3: Move reading-profile reveal behavior out of `main.ts`

Once a session helper exists, the reading reveal state should stop being a top-level `main.ts` variable.

That includes:

- whether reading reveal is enabled
- whether controls are currently revealed
- reset behavior on full reset / checkpoint reset

This is a good incremental way to keep future reading-profile work from going back into `main.ts`.

### Step 4: Revisit conservative re-collapse as a second attempt

The failed attempt to auto-collapse reading widgets suggests the first version was too broad.

Recommended retry order:

1. opening one reading widget collapses other reading widgets
2. only after that works, add scroll + idle collapse

Do not combine both in the first retry.

### Step 5: Extract practice frame concerns

Once the diagram module and session boundary are clearer, anything truly practice-frame-specific should become easier to isolate.

Candidate concerns:

- set selector
- puzzle count / solved count / perfect / undo strip
- next-puzzle queue behavior

These belong outside shared diagram navigation.

## What Should Stay In `main.ts`

After the next couple of refactors, `main.ts` should still own:

- startup/bootstrap
- top-level URL parsing
- problem resolution
- root render orchestration
- engine initialization
- high-level coordination between:
  - engine
  - script runtime
  - interaction policy
  - session helper
  - hand diagram module
  - surface frame

It should not keep accumulating:

- widget-specific transient UI state
- transport-side mutable memory
- practice/article layout exceptions
- profile-specific decision logic

## Risks And Anti-Goals

### Risk: surface regains behavior ownership

This is the main regression to avoid.

Surface should frame; it should not determine what `>` means.

### Risk: practice/article geometry drifts again

The recent overlap bug was a direct example.

Status/control geometry should be shared.

### Risk: policy and session get mixed again

Examples:

- “should prompt first” belongs to policy
- “is the follow prompt already active at this cursor?” belongs to session

This distinction should stay explicit in future refactors.

### Anti-goal: broad mode-wide refactor right now

Do not try to pull standard DD, single dummy, and all other modes into a large unifying rewrite at once.

The current highest-value cleanup remains:

- article/practice hand-diagram behavior
- session boundary
- `main.ts` responsibility reduction

## Practical Checklists

### Before the next refactor step

- keep current behavior fixed
- add tests for any new extracted policy/helper logic
- avoid CSS-only fixes when the issue is shared geometry responsibility

### After each refactor step

- verify VSC story-viewing still clicks through correctly
- verify DD1 puzzle-solving still blocks/prompts correctly
- verify practice and article diagrams still share spacing/geometry
- verify widget message/status layout has not drifted

## Concrete Next Task Recommendation

If work resumes from this plan, the best next task is:

1. create a small `handDiagramSession` helper
2. move reading reveal state plus widget transient outcome state into it
3. keep behavior unchanged

Why this first:

- it attacks the next real seam
- it reduces `main.ts` state clutter
- it sets up the next reading-profile work cleanly
- it avoids another round of local patches

## Parting Thought

The recent work has already produced two real architectural wins:

- a tested interaction-policy layer
- a shared hand-diagram navigation module

The next wins should focus less on extracting more rendering and more on making session ownership explicit.

That is the missing layer most likely to prevent future drift across VSC, DD1, practice, and reading-profile behavior.
