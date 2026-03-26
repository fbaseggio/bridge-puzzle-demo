# Article Script And Interaction Architecture

## Purpose

This note stabilizes the vocabulary around problem definitions, scripts, surfaces, puzzle modes, interaction profiles, and session state.

It is intended to help future implementation work and future GPT sessions avoid conflating:

- script architecture
- interaction behavior
- puzzle semantics
- UI surface concerns

## Current Stack

### 1. Problem definition

A problem definition is the base bridge position and gameplay setup.

It includes things like:

- hands / deal
- leader
- contract
- goal
- baseline policies
- metadata

Examples:

- `src/puzzles/double_dummy_01.ts`
- `src/puzzles/experimental_draft.ts`

### 2. Optional authored behavior layer

A problem definition may have zero, one, or multiple authored overlays attached to it.

Current concrete example:

- scripts attached by `parentProblemId`

This layer is optional. A problem may still be used without it.

This layer can provide:

- authored progression
- custom E/W behavior
- branch structure
- assertions
- authored semantic or narrative events

This layer is broader than "policy" and broader than "narration".

### 3. Script data

A script is authored data attached to one specific problem definition.

Current location:

- `src/demo/articleScripts.ts`

Current relationship:

- one problem definition may have multiple scripts
- any given script is authored for exactly one problem definition

Examples:

- `experimentalDraftIntroScript`
- `doubleDummy01Script`

### 4. Script runtime

The script runtime is the matching / replay / progression engine that interprets script data against play history.

Current locations:

- `src/demo/articleScriptRuntime.ts`
- parts of `src/demo/main.ts`

Runtime responsibilities include:

- matching history against script
- reconstructing branch selections
- replaying scripted cards
- deriving `pre / in / off / post` state
- resolving branch-aware end cursors

### 5. Puzzle mode

Puzzle mode answers:

> What is the game?

It describes gameplay semantics and solver expectations, not UI posture.

Examples already in the codebase:

- Double Dummy
- Single Dummy
- Multi-EW
- Draft

Puzzle mode determines things like:

- hidden-information model
- legality context
- solver correctness expectations

### 6. Surface

Surface is where the experience is presented.

Current surfaces:

- `workbench`
- `practice`
- `article`

Current practical roles:

- `workbench`
  - mostly debugging / development surface
  - still contains some user-facing behavior
- `practice`
  - puzzle-set surface with score/progress continuity
- `article`
  - generic authored-experience surface
  - currently the preferred place to explore new puzzle/story interaction ideas

### 7. Interaction profile

Interaction profile answers:

> How is the user interacting with it?

This is distinct from surface and distinct from puzzle mode.

Candidate profiles discussed so far:

- `reading`
  - nearly invisible chrome
  - typeset first
- `exploration`
  - click legal cards freely
  - easy forward/back movement
  - optional semantic overlays
- `puzzle-solving`
  - little help
  - scoring / rubric active
  - examples include DD-accuracy and curated-variation goals
- `story-viewing`
  - mainly follow an authored line
  - transport and narration central
- `solution-viewing`
  - related to story-viewing
  - explicitly complements puzzle-solving

Interaction profile should govern:

- available controls
- autoplay behavior
- default pacing
- visibility of semantic information
- scoring posture
- branch-handling expectations

Important:

- a problem may support multiple interaction profiles
- a script may enrich some profiles without being required for all of them

### 8. Session

Session is the run-specific state around interacting with a problem.

This is separate from script data, script runtime, and UI chrome.

Session includes:

- play history
- undo/redo behavior
- branch completion tracking
- hint count
- mistake count
- autoplay state
- current transport-related memory

Current implementation is scattered, mostly in:

- `src/demo/main.ts`

## Interpreted State

Raw game state is not the full product state.

The product also uses richer interpreted state derived from multiple layers:

- base engine state from play history
- DDS / baseline policy understanding
- semantic reducer understanding
- authored script understanding

These layers do more than explanation. They can contribute to:

- interpretation
- control decisions
- annotations / narration
- scoring/session consequences

This is part of what makes the experience feel like bridge rather than abstract search.

## Semantic Events

There are currently two broad sources of meaning above raw card state:

### Generic derived semantics

Current engine / semantic pipeline:

- collector / reducer / teaching event flow in `src/demo/main.ts`
- core semantic machinery in `src/core/semanticReducer.ts`

These derive meaning from gameplay and policy behavior.

### Authored semantics

The authored behavior layer may eventually emit:

- custom narration
- script-linked semantic events
- authored instructional messaging

These should belong to the authored behavior layer, with the UI responsible only for rendering them.

## VSC vs DD1

These are the same architectural kind of thing:

- a script attached to a problem definition

They differ in intended interaction profile.

### Veering Squeeze Card article

Intended interaction profile:

- `story-viewing`

Current code expression:

- article surface
- attached script
- simple checkpointed authored progression

### Double Dummy 1 article

Current intended interaction profile:

- mostly `puzzle-solving`

Later it is also expected to support:

- `solution-viewing`

Current code expression:

- article surface
- attached script
- DD-aware authored behavior
- branch completion / hint / mistake tracking

## Important Current Drift

The Veering article used to support simple `>` click-through story progression.

After DD1 introduced richer puzzle-style script behavior, shared article-script transport logic drifted toward puzzle-solving behavior. As a result, Veering inherited stop-and-choose behavior that is wrong for its intended profile.

Root cause:

Interaction behavior is currently encoded implicitly in shared UI/runtime logic instead of being parameterized by interaction profile.

## Current Code Reality

The code mostly has one script architecture already:

- script data in `src/demo/articleScripts.ts`
- runtime matching/replay in `src/demo/articleScriptRuntime.ts`
- UI and session glue in `src/demo/main.ts`

But it does not yet cleanly separate:

- authored behavior layer
- script data
- script runtime
- interaction profile
- session
- UI behavior

## Near-Term Guidance

When discussing a behavior or regression, identify:

1. problem definition
2. optional authored behavior layer / script
3. puzzle mode
4. surface
5. interaction profile
6. session behavior

Do not assume that:

- article surface implies story-viewing
- script implies puzzle-solving
- practice surface is the only place puzzle-solving behavior belongs

## Medium / High Priority Architecture Todos

### Core architecture

- Introduce an explicit interaction-profile concept.
- Promote session to a first-class architectural layer.
- Separate script data from script runtime more clearly.
- Pull more script semantics out of `main.ts`.

### Script system

- Replace flat trick-order encoding with trick-structured authoring where order is derived from leader.
- Separate matchers from assertions explicitly in the script model.
- Add first-class transposition / join support.
- Add script validation against holdings and trick logic.
- Normalize derived E/W behaviors into a deliberate authored-policy layer.

### Cleanup

- Deprecate and remove residual `flex` machinery once the replacement model is stable.
- Reduce mutable UI-side script bookkeeping where derivation from history is sufficient.

## Non-goals For Now

- Do not merge scripts into problem definitions.
- Do not create separate script systems for VSC and DD1.
- Do not redesign puzzle modes just to support interaction-profile cleanup.
- Do not change engine / DDS gameplay semantics as part of this architectural clarification.
