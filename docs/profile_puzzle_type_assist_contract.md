# Profile, Puzzle Type, And Assist Contract

## Purpose

This note captures the current architectural contract for:

- interaction profile
- puzzle type
- assist model
- session state
- authored/script refinement

It exists to prevent future work from collapsing these concerns back into:

- surface-specific behavior
- one-off assist hacks
- DD1-specific patches that really belong in shared interaction policy

This note is intentionally narrower than the broader architecture docs. It is meant to guide concrete implementation work around `solution-viewing`, future `exploration`, and puzzle-type-specific assist behavior.

## Status

This is a design contract, not a demand for immediate refactoring.

Current code already contains pieces of this model:

- `story-viewing`, `puzzle-solving`, and `solution-viewing` are now code-level interaction profiles
- assist levels and presets are currently keyed mostly by puzzle mode
- practice entry into `solution-viewing` now goes through a profile seam instead of a bare `solutionMode` boolean

But the model is still only partially expressed in code. This note defines the intended ownership boundaries so that future changes do not drift.

## Core Distinctions

### Interaction profile

Interaction profile answers:

> How is the user interacting with this right now?

Examples:

- `reading`
- `exploration`
- `puzzle-solving`
- `story-viewing`
- `solution-viewing`

Profile is about posture and control semantics, not about the underlying game and not about the surrounding page/frame.

Profile should govern things like:

- whether the experience is testing vs guided
- whether scoring is active
- whether guided transport exists
- whether departure from guided play should be signaled
- the broad expectations for pacing and control behavior

Profile should not fully define:

- what counts as a good continuation in a given puzzle family
- the exact assist ladder labels for every puzzle type
- authored script content

### Puzzle type

Puzzle type answers:

> What kind of bridge experience is this?

Examples already present in the repo:

- standard double dummy
- single dummy
- multi-EW
- scripted DD-par style
- draft

Puzzle type should govern things like:

- how guidance is computed
- what hinting/visibility concepts make sense
- how transport pauses are interpreted
- which assist levels are available
- how those levels are labeled

Puzzle type should not govern:

- outer surface framing
- whether the current posture is testing vs guided

### Assist model

Assist is not purely profile-owned and not purely puzzle-type-owned.

The correct model is resolved:

`effective assist model = profile posture + puzzle-type ladder + optional script/problem refinement + user overrides`

That means:

- profile contributes the posture in which assistance is interpreted
- puzzle type contributes the concrete ladder and help semantics
- scripts/problems may refine content or behavior within that structure
- session stores the user's current selection and overrides

### Session

Session answers:

> What is true for this run right now?

Session should own:

- active interaction profile
- active assist level
- user binary overrides
- run history
- scoring state
- current guided/off-guided status
- script-related state such as `pre / in / off / post` where applicable

Session should not own:

- the meaning of a profile
- the meaning of a puzzle type
- surface-specific layout

### Authored/script refinement

Scripts are more than narration.

A script may supply:

- problem-specific continuation policy
- authored forks
- triggered authored content
- assertions
- richer guided behavior than generic puzzle policy can provide

Scripts should refine interaction behavior for a specific problem, but they should do so by plugging into profile/puzzle-type boundaries rather than defining a brand new architecture for themselves.

## Ownership Contract

### Profile owns

- testing vs guided posture
- whether scoring is active
- whether guided transport exists
- broad expectations for `>` and `>>|`
- whether departure from guided play should be surfaced
- whether an assist ladder matters in this profile

### Puzzle type owns

- the available assist levels
- their labels
- their default semantics
- what "good continuation" means
- how forks are resolved by default
- what counts as a meaningful pause for `>>|`

### Script/problem refinement owns

- authored continuations and authored forks
- authored solution-state content
- problem-specific tuning of guidance within an existing puzzle type/profile contract

### Session owns

- current profile
- current assist level
- binary override toggles
- current transport memory
- current run state
- off-guided/off-script current status

### Surface owns

- entry affordances
- outer framing
- product-specific gating such as when `Show Solution` appears

Surface must not own the semantics of the profile it exposes.

## Assist Contract

### General rule

The user should be able to rely on the assist slider as a coherent preset ladder, while still retaining binary controls for aspects they want to override.

The implementation rule is:

`effective help state = resolved assist preset + user binary overrides`

### Current implications

- assist ladders may differ by puzzle type
- labels may differ by puzzle type
- some puzzle types may omit levels that do not make sense for them
- scripts may eventually refine a level's behavior or content, but should not invent ad hoc UI semantics casually

### Current code reality

The current code already leans puzzle-type-first for assist:

- ladder options differ by puzzle mode
- labels differ by puzzle mode
- presets differ by puzzle mode

This is a useful baseline and should not be flattened into one global profile table.

What should evolve later is not "make all ladders identical," but "resolve assist behavior through a cleaner seam than a single large coordinator file."

## Solution-Viewing Contract

### Definition

`solution-viewing` is a guided, non-scoring interaction profile that complements `puzzle-solving`.

Its purpose is to help the user follow, inspect, and understand strong continuations from the current state without primarily testing them.

### Required behavior

- the user may still play any legal card
- `>` means "guide me forward"
- `>>|` means "advance to the next meaningful guided pause"
- departure from guided play should usually be signaled
- entering `solution-viewing` should apply profile-appropriate assist defaults, while still allowing user overrides

### Important variability

`solution-viewing` is not globally uniform across all puzzle types.

The profile contract is stable, but these details are puzzle-type-specific:

- whether `>` auto-picks or prompts at a fork
- how good continuations are computed
- what counts as a meaningful pause for `>>|`
- how guidance behaves after the user departs from the guided line

### Current product decisions

For current work, preserve these behaviors:

- standard puzzles:
  keep current solution behavior, but reorganize it structurally rather than redesigning it
- scripted puzzles such as DD1 and VSC:
  preserve their existing puzzle-solving behavior until a solution-viewing entry path is intentionally added

### Signaling departure

Departure from guided play should usually be visible.

Current examples already in the product:

- story-related status can show an `Off` prefix
- inaccurate-card situations can show a red box on the inaccurate card and green boxes on accurate alternatives

This signaling belongs to shared interaction/rendering behavior, not to a specific surface.

## Scripted Problems And Guided State

For scripted problems, the runtime already uses states such as:

- `pre-script`
- `in-script`
- `off-script`
- `post-script`

These should remain runtime/script concepts.

Do not overload every guided deviation in every puzzle family into `off-script`.

Instead:

- use runtime/script state for relation to authored progression
- use interaction/session state for relation to guided transport more generally

This matters because a non-scripted puzzle can be off-guided without being "off-script," and a scripted puzzle can be both in `solution-viewing` and currently `off-script`.

## Terminology Rule

Use `fork` for multiple good continuations in general guided behavior.

Use `branch` only for actual authored script branch structure.

This avoids turning every puzzle choice into a script architecture term.

## Implementation Guidance

### Near-term rule of thumb

When adding or changing behavior, ask:

- if this changes testing vs guided posture, scoring, or the meaning of `>`:
  profile concern
- if this changes what continuations or assist levels exist for a puzzle family:
  puzzle-type concern
- if this changes the current selected level or override state:
  session concern
- if this changes authored messages or authored continuation logic for one problem:
  script/problem refinement
- if this changes where the affordance appears on the page:
  surface concern

### What not to do

- do not let `article` or `practice` define what `solution-viewing` means
- do not make DD1-specific patches that should really be shared profile/puzzle-type behavior
- do not collapse `solution-viewing` back into "just set assist level to solution"
- do not make shared control behavior depend on page chrome
- do not treat every guided fork as a script branch

### Likely future seam

The current small `interactionProfiles.ts` module is a useful start, but it should not become a junk drawer for all profile, puzzle-type, and assist logic.

A cleaner future direction would be a resolver-style seam, conceptually like:

- resolve active profile posture
- resolve assist ladder for `(profile, puzzleType, scriptContext?)`
- resolve effective controls from `(preset + overrides)`

That should happen only when a concrete product need requires it.

## Practical Consequences For Upcoming Work

For DD1 solution-viewing work:

- first create or use a clean entry path into `solution-viewing`
- keep the shared profile contract separate from the article surface
- preserve DD1 puzzle-solving behavior until solution-viewing is explicitly entered
- add authored solution-state content only after the active-profile boundary is clear

For standard practice puzzles:

- preserve current behavior
- reorganize toward the contract above
- do not redesign the user experience just because the architecture is becoming clearer
