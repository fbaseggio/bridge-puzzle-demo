# Widget Journey Contract

## Purpose

This note defines `Journey` as a first-class concept for widget architecture.

It exists to separate:

- `Journey`
- `Problem`
- `Chrome`

so that future work on profiles, startup behavior, solution entry, snapshot
restore, and testing does not keep smearing those concerns together.

This note is meant to guide design and incremental extraction work.

It is not a demand for an immediate broad refactor.

## Status

The underlying idea is already present in discussion, testing, and some code,
but only partially expressed in the current implementation.

Current code already contains pieces of the model:

- interaction profiles
- widget startup/journey resolution
- widget snapshot `journey` state
- prompt-aware transport behavior
- explicit widget chrome/session state

But the ownership boundary is still incomplete.

This note defines the intended contract so future changes align to one model.

## Core Thesis

A widget is fundamentally:

- `Journey`
- `Problem`
- `Chrome`

Pure display details aside, anything that affects:

- the widget's state
- or how that state changes

should belong to either `Journey` or `Problem`.

`Chrome` should own presentation framing and local visibility state, but not the
meaning of transport or profile transitions.

## Ownership Boundaries

### Problem owns

`Problem` answers:

> What bridge/script position are we actually in?

Problem ownership includes:

- current bridge/runtime position
- article script checkpoint/cursor/history
- authored/script choice state
- branch progress tied to the scripted problem
- legal continuations
- hint/best-action/problem-guidance facts
- anything where the question is about the underlying content rather than the
  user's posture toward it

Problem should not own:

- startup posture
- profile transitions
- reveal/open-close UI framing

### Journey owns

`Journey` answers:

> How is the user moving through this experience right now?

Journey ownership includes:

- active interaction posture
- the currently active interaction profile
- startup posture and whether it has been consumed
- which profile transitions are available
- which user actions cause profile/posture transitions
- whether the user has moved away from the initial guided path
- interaction-lifecycle rules such as reading-to-story or
  puzzle-solving-to-solution transitions

Journey should not own the underlying bridge position itself.

Journey also should not become a junk drawer for all widget UI state.

### Chrome owns

`Chrome` answers:

> How is the current widget experience being framed visually right now?

Chrome ownership includes:

- reveal stage (`collapsed` / `quiet` / `full`)
- companion panel hidden/open state
- settings/tools drawer visibility
- other local open/closed framing state

Chrome should be able to affect what the user sees immediately.

But Chrome should not define transport semantics by itself.

### Surface owns

Surface owns:

- entry affordances
- outer framing
- article/workbench/practice placement

Surface may influence initial widget configuration.

Surface must not own ongoing journey or transport semantics.

## Active Interaction Profile

`activeInteractionProfile` should be the main driver of immediate transport
semantics.

Examples:

- `reading-profile`
- `story-viewing`
- `puzzle-solving`
- `solution-viewing`

Profile should determine things like:

- what `>` means
- what `>>|` means
- whether prompt-then-follow behavior exists
- whether explicit choice should prompt or auto-choose
- broad autoplay/guidance expectations

Journey should usually **not** define those transport rules directly.

Instead:

- `Journey` decides when the active profile changes
- `activeInteractionProfile` determines the immediate transport semantics under
  that posture

This is the most important relationship in this contract.

`reading-profile` should still be treated as a real profile, even though it is
lighter-weight and more display-heavy than the others.

It often serves as the initial posture in a journey, especially for article
widgets, and it changes the interaction contract enough to deserve explicit
status rather than being treated as only a collection of chrome flags.

## Intended Journeys

The project should aim for a small number of reusable journeys, not one
journey per article or puzzle.

Current likely journeys are:

### Reading to story

- start in `reading-profile`
- reveal controls quietly
- transition into `story-viewing`
- transport then behaves according to `story-viewing`

This is likely the most common article-widget journey.

### Puzzle-solving to solution-viewing

- start in `puzzle-solving`
- user may explicitly enter `solution-viewing`
- transport then behaves according to `solution-viewing`

Some experiences may also begin in `reading-profile` and then transition into
`puzzle-solving`, but that should be treated as a reuse of a small number of
journey patterns rather than a reason to invent article-specific startup
behavior.

### Possible later exploration/open-play journey

- not yet fully defined
- may sit alongside or between other journeys later

This note does not require that all of these be equally implemented today.

It does require that future work treat them as reusable journey families rather
than article-specific hacks.

## Current Article Startup Patterns

The remaining widgets under `Articles` do not all start from the same literal
inputs, even if they should eventually converge on a smaller number of journey
patterns.

It is useful to distinguish two different kinds of startup information:

- startup posture inputs, such as `reading=1`, which nudge Journey toward an
  initial `reading-profile`
- richer startup payload, such as article script/checkpoint or `start` plus an
  `opening` sequence, which says more about what `Start` should consume

Current `Articles` examples:

- `Introduction to the Veering Squeeze Card`:
  all 3 widgets carry richer startup payload through `articleScript` plus
  `checkpoint`, along with `reading=1`
- `Gorillas`:
  most widgets carry startup posture input only through `reading=1`; the
  `sd-puzzle` full-deal widget also carries richer startup payload through
  `start=1` plus `opening=...`
- `Ruff or Sluff`:
  widgets generally carry startup posture input through `reading=1`, and 3
  widgets also carry richer startup payload through `start=1` (with one of
  those also carrying `opening=...`)
- `Squeeze Self`:
  the current widget has no explicit startup input beyond the base problem

This supports the broader direction of the contract:

- Journey should mediate startup from widget initial config plus relevant
  problem/script defaults
- not all article widgets need richer startup payload
- startup payload should stay separate from the abstract journey family it
  serves

For the current article widgets, the intended direction is:

- article widgets generally start in `reading-profile`
- only widgets with richer startup payload should expose a startup affordance
- pressing that startup affordance is a `Journey + Problem` action:
  - it releases the initial startup payload
  - it reveals quiet controls
  - it transitions the widget into the next journey profile
- for many article widgets, that next profile will be `story-viewing`
- some article widgets may instead transition from `reading-profile` into
  `puzzle-solving`; the `sd-puzzle` full-deal widget in `Gorillas` is the
  clearest current example
- once the startup affordance has been consumed, the exact transport behavior
  depends on the resulting active profile and underlying problem mode/content
  source

This keeps the higher-level article journey consistent without requiring every
article widget to carry the same startup payload.

## Action Taxonomy

User actions should be understood as belonging to one of three categories.

### Problem-only actions

These change the problem state while journey/profile remain stable.

Typical examples:

- most `>` clicks while already inside a stable active profile
- most `>>|` clicks while already inside a stable active profile
- choosing an explicit branch option without changing overall posture

### Journey-only actions

These change journey or chrome posture without advancing the underlying
problem.

Typical examples:

- opening quiet controls
- opening fuller controls
- transitioning from `reading-profile` to a fuller control posture without
  advancing the underlying problem
- entering `solution-viewing` if that entry action does not itself advance play

### Journey + problem actions

These change the active posture and the underlying problem state together.

Typical examples:

- startup release from `reading-profile`, when it transitions into the next
  journey profile and consumes initial startup payload
- for many article widgets, this means entering `story-viewing` and playing the
  first card
- for some widgets, such as the `Gorillas` `sd-puzzle` full deal, this may mean
  entering `puzzle-solving` while also consuming an opening sequence
- any future solution-entry action that both changes profile and immediately
  advances guided play

This category is important because it is easy to accidentally model such
actions as only journey or only problem transitions.

## State Taxonomy

Current and future state should be classified deliberately.

### Journey state

Journey state likely includes:

- active interaction profile
- startup gate phase
- startup bias/source
- whether the widget is still in its initial `reading-profile` posture or has
  already transitioned out of it
- whether the user has departed the initial posture in a meaningful way

### Problem state

Problem state includes:

- script checkpoint/cursor/history
- choice selections
- branch/problem progress
- any other state that changes the underlying bridge/script position

### Chrome state

Chrome state includes:

- reading reveal stage
- companion panel hidden/open
- tools/settings drawer visibility

### Session memory that changes what next means

Some state is not purely problem or purely chrome, but it changes what the next
button press means and therefore must be explicit somewhere.

Examples:

- `followPromptCursor`
- branch tried/completed/known memory
- other prompt/transport memory

This state should not be hidden in DOM behavior or ad hoc locals.

Whether it is ultimately classified under journey, problem-session, or a
transport/session seam, it must be treated as real product state.

### Debug-only transient state

Some state is useful for debugging but does not need to be part of the
canonical contract by default.

Examples:

- current message text
- transient visual error/hint state
- dismissed outcome keys
- current companion content payload if already derivable

## Snapshot Implications

Snapshot/restore should reflect the ownership model.

Canonical snapshot should distinguish:

- problem state
- journey state
- chrome state

Do not treat `journey` as a catch-all for every widget field.

Only state that affects future behavior should be required in the canonical
restorable snapshot.

This is especially important for:

- startup gate phase
- active profile
- prompt/follow memory if it changes the meaning of the next click
- branch/session memory that changes scripted behavior

## Testing Implications

This contract should sharpen testing structure.

### Problem progression tests

These assert underlying scripted/runtime progression.

### Journey transition tests

These assert posture/profile transitions such as:

- reading to story
- puzzle-solving to solution-viewing
- startup gate consumption

### Transport tests under a profile

These assert real `>` / `>>|` behavior under a specific active profile.

### Chrome/render tests

These assert visible framing behavior such as:

- reveal/open state
- repaint scheduling
- panel visibility

This contract supports the existing testing guidance:

- progression-only pilots should not overclaim transport authority
- prompt-aware transport tests should use the real shared seam

## Current Code Mapping

Current partial seams include:

- [`widgetJourneyState.ts`](../src/demo/widgetJourneyState.ts)
- [`widgetStateSnapshot.ts`](../src/demo/widgetStateSnapshot.ts)
- [`articleScriptWidgetActionCore.ts`](../src/demo/articleScriptWidgetActionCore.ts)
- [`articleScriptWidgetTransport.ts`](../src/demo/articleScriptWidgetTransport.ts)
- [`handDiagramSession.ts`](../src/demo/handDiagramSession.ts)
- [`main.ts`](../src/demo/main.ts)

Current reality:

- `widgetJourneyState.ts` provides a thin resolved journey view
- snapshot carries a small explicit `journey` block
- `reading-profile` is now first-class in the Journey resolver/runtime/snapshot
  path, but not yet in the broader global script/practice profile model
- transport semantics are increasingly profile-driven
- startup mediation and journey-changing actions are still only partially
  extracted, with significant wiring still in `main.ts`

So the contract is ahead of the implementation, but not disconnected from it.

## First Extraction Candidate

If this contract drives further code work, the next extraction should be small.

The most plausible first seam is:

- a clearer resolved journey state plus journey-changing action seam

Not:

- a universal widget state machine
- a broad rewrite of all widget/session code

The goal is to make journey transitions more explicit without destabilizing the
problem/runtime stack.

## Avoid

Avoid these mistakes:

- treating `Journey` as just another name for `activeInteractionProfile`
- letting surface define transport/journey semantics
- stuffing chrome state into journey because it is nearby
- stuffing all session/debug state into journey because it is convenient
- assuming every newly exposed seam must be extracted in the same thread that
  discovers it

## Practical Rule

When evaluating widget behavior, ask:

1. Is this changing the `Problem`?
2. Is this changing the `Journey`?
3. Is this changing only `Chrome`?
4. If it changes more than one, is that intentional and explicit?

If future work keeps answering those questions clearly, the architecture should
become easier to reason about without requiring one giant refactor.
