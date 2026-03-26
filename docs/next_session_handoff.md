# Next Session Handoff

## Purpose

This note is the short handoff for the next worker.

It is meant to replace longer implementation-history prompts with:

- the current stable architecture
- the important current product decisions
- the things that are working and should not be disturbed
- the most useful next architectural seam

For fuller background, see:

- [article_script_interaction_architecture.md](/Users/edgar/Documents/Codex/docs/article_script_interaction_architecture.md)
- [hand_diagram_session_refactor_plan.md](/Users/edgar/Documents/Codex/docs/hand_diagram_session_refactor_plan.md)

## Current Stable Architecture

The current working stack is:

1. engine
2. problem definition
3. script data / authored behavior
4. script runtime
5. interaction policy
6. session state
7. hand-diagram navigation
8. surface frame
9. app coordinator

Current code alignment:

- script data:
  - `/Users/edgar/Documents/Codex/src/demo/articleScripts.ts`
- script runtime:
  - `/Users/edgar/Documents/Codex/src/demo/articleScriptRuntime.ts`
- interaction policy:
  - `/Users/edgar/Documents/Codex/src/demo/articleScriptInteractionPolicy.ts`
- shared diagram-adjacent UI:
  - `/Users/edgar/Documents/Codex/src/demo/handDiagramNavigation.ts`
- app coordinator:
  - `/Users/edgar/Documents/Codex/src/demo/main.ts`

Important architectural point:

- `surface` should frame the experience
- `interaction profile` / `mode` / script/session state should determine control behavior
- `handDiagramNavigation` should own shared diagram + status + control layout

## Current Product Decisions

### Interaction profiles

- VSC / `experimentalDraftIntroScript` is `story-viewing`
- DD1 / `doubleDummy01Script` is `puzzle-solving`

### Reading-profile rollout

- articles with `3+` diagrams start in reading posture
- articles with `1–2` diagrams keep their normal visible controls

Current reading-profile behavior:

- widget starts collapsed
- reveal edge shows a thin line with right-aligned chevron
- once opened, controls stay open
- there is no auto-collapse currently

This is intentional for now.

### Branch box

- hide branch box in story/reading posture
- keep branch box in scripted-puzzle posture

### Practice vs article

- practice has its own top frame/header
- diagram + status + controls should share layout details with article/widget

This was recently re-aligned and should stay that way.

## Known Good Behaviors: Do Not Break

### VSC

- `>` click-through story behavior
- explicit branch behavior:
  - first `>` prompts
  - second `>` chooses
  - revisiting prefers an untried option
- reading-profile reveal edge

### DD1

- puzzle-style blocking on scripted N/S decisions
- second `>` follow-script behavior
- hint counting for scripted follow
- branch completion-aware rewind
- branch completion-aware branch auto-choice

### Shared UI behaviors

- widget message band bottom-anchored above controls
- short/long messages fitting without moving hands or controls
- practice/article shared diagram/status/control geometry
- inline emphasis in script-authored text uses `display: contents`

Important:

- the caption-in-reveal-band experiment was tried and rejected
- do not bring it back by default

## Current Code Reality

### Extracted policy layer

`/Users/edgar/Documents/Codex/src/demo/articleScriptInteractionPolicy.ts` exists and is tested.

It currently owns pure decisions for:

- branch option selection by profile
- recursive branch completion
- previous unfinished branch lookup
- scripted user-advance blocking
- explicit branch prompt/choose behavior
- remembered-tail replay gating
- scripted defender autoplay gating

Tests:

- `/Users/edgar/Documents/Codex/test/demo/articleScriptInteractionPolicy.test.ts`

### Extracted diagram navigation

`/Users/edgar/Documents/Codex/src/demo/handDiagramNavigation.ts` exists and is the shared diagram-adjacent UI module.

It currently renders:

- status/outcome
- transport row
- practice secondary actions
- reading reveal edge

It is still controller-heavy, but it is the right shared seam.

### `main.ts`

`/Users/edgar/Documents/Codex/src/demo/main.ts` is still large.

It still mixes:

- bootstrap
- URL parsing
- problem selection
- practice frame/session state
- article-script session state
- widget transient state
- rendering orchestration
- many derived helpers

The next cleanup should reduce state clutter more than rendering clutter.

## Recommended Next Architectural Step

Best next step:

- introduce a small explicit session/helper boundary for hand-diagram interaction state

Suggested target:

- `/Users/edgar/Documents/Codex/src/demo/handDiagramSession.ts`

Initial scope:

- widget transient status/outcome state
- follow-prompt cursor / sticky-message state
- branch completion / tried-option maps
- reading reveal state
- closely related session-side helpers

Reason:

- the policy layer already exists
- the diagram navigation layer already exists
- the next missing explicit layer is session ownership

## Avoid

- surface-specific control behavior
- practice-only geometry patches when the issue is shared diagram layout
- pushing policy logic back into `main.ts`
- mixing policy and session concerns
- broad all-modes refactors
- reviving abandoned `flex` machinery

## If You Need A Safe Rule Of Thumb

When deciding where something belongs:

- if it answers “what should the controls do?”:
  - policy
- if it answers “what is true for this run right now?”:
  - session
- if it answers “where and how is this diagram UI laid out?”:
  - hand-diagram navigation
- if it answers “what page/frame surrounds this?”:
  - surface
- if it answers “what happens when this card is played?”:
  - engine / runtime

## Status At End Of This Session

- no active known regressions
- reading-profile auto-collapse was attempted and backed out
- current reading-profile baseline is stable
- practice/article geometry is aligned again
- VSC and DD1 are both in acceptable shape to continue from here
