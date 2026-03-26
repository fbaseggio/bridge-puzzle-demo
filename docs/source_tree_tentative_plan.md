# Source Tree Tentative Plan

## Purpose

This note sketches a likely future shape for the `src` tree, especially `src/demo`.

It is not a request to reorganize files immediately.

Its purpose is to:

- capture the current organizational pressure in `src/demo`
- propose a tree shape that matches the architecture direction
- avoid future reorganization that accidentally recenters surface-specific structure
- give future workers a map for gradual moves when a concrete product need justifies them

## Status

This note is intentionally tentative.

The current app is still evolving around:

- interaction profiles
- scripted transport behavior
- practice/article/workbench boundaries
- assist/profile/puzzle-type structure

That means a tree reorganization should follow stable seams, not lead them.

## Current Tree Reality

At the top level, `src` already has meaningful domain-oriented areas:

- `src/core`
- `src/ai`
- `src/puzzles`
- `src/encapsulation`
- `src/data`
- `src/ui`
- `src/demo`

The pressure is mainly inside `src/demo`.

Today `src/demo` contains a mix of:

- app bootstrap and coordination
- shared diagram-adjacent UI
- session helpers
- scripted runtime and policy
- display helpers
- practice configuration/content selection
- styling

That means `src/demo` is already functioning as the runnable product/app layer, not as a small throwaway demo folder.

## Current `src/demo` Shape

Representative files:

- app coordinator:
  - `main.ts`
- shared diagram/session/policy:
  - `handDiagramNavigation.ts`
  - `handDiagramSession.ts`
  - `settingsPanelSession.ts`
  - `interactionProfiles.ts`
- scripted behavior:
  - `articleScripts.ts`
  - `articleScriptRuntime.ts`
  - `articleScriptInteractionPolicy.ts`
- display helpers:
  - `cardDisplay.ts`
  - `regularDisplayView.ts`
  - `teachingDisplay.ts`
  - `ewVariantView.ts`
  - `unknownModeDisplay.ts`
  - `unknownModeReplay.ts`
- content/config selection:
  - `problems.ts`
  - `practiceSets.ts`
  - `playAgain.ts`
- styling:
  - `style.css`

This is not inherently wrong, but it is too flat for the architecture that now exists.

## Main Organizational Principle

If `src/demo` is reorganized, it should be organized primarily by architectural boundary, not by visible surface.

That means:

- do not make `article`, `practice`, and `workbench` the first split unless those folders only contain framing concerns
- do not move shared control/layout behavior into surface folders just because those surfaces are where users see it
- do not let folder structure encourage surface ownership of interaction behavior

This follows the same rule as the runtime architecture:

- surface frames the experience
- interaction/profile/session/policy determine behavior
- shared hand-diagram modules own shared diagram-adjacent layout

## Recommended Direction

The best near-term direction is:

- keep `src/demo` as the app root for now
- give it internal subtrees that reflect the architecture

This is better than both:

- keeping `src/demo` flat forever
- prematurely renaming `demo` itself before the app shell is conceptually settled

## Recommended Target Shape

A plausible target shape is:

- `src/demo/app`
- `src/demo/diagram`
- `src/demo/session`
- `src/demo/script`
- `src/demo/content`
- `src/demo/display`
- `src/demo/settings`

This should be understood as a directional map, not a literal migration order.

## Suggested Responsibilities

### `src/demo/app`

Owns top-level coordination and bootstrap.

Examples:

- startup/bootstrap
- URL parsing
- root render orchestration
- high-level coordination across engine, script runtime, session, and surfaces

Likely files:

- `main.ts`

If this area grows, it may eventually want helpers like:

- app routing / URL helpers
- problem selection helpers
- top-level coordinator helpers

### `src/demo/diagram`

Owns shared diagram-adjacent UI and shared control/status layout.

Examples:

- transport row rendering
- status/outcome rendering
- secondary shared action rows
- reading reveal edge

Likely files:

- `handDiagramNavigation.ts`

Potential future neighbors:

- transport-row helpers
- shared status rendering helpers

This area should stay shared across article, practice, and workbench where possible.

### `src/demo/session`

Owns run-local mutable UI/session state that is not the engine itself.

Likely files:

- `handDiagramSession.ts`
- `settingsPanelSession.ts`

Potential future neighbors:

- practice session helpers if they are ever extracted from `main.ts`
- profile/assist session helpers if they become substantial

This area should not absorb policy.

### `src/demo/script`

Owns authored/scripted behavior.

Likely files:

- `articleScripts.ts`
- `articleScriptRuntime.ts`
- `articleScriptInteractionPolicy.ts`

Potential future neighbors:

- authored solution-state content helpers
- script-specific resolver helpers

This area is about authored behavior and script-aware policy/runtime, not about article framing.

### `src/demo/content`

Owns content selection and app-side registries.

Likely files:

- `problems.ts`
- `practiceSets.ts`

Potential future neighbors:

- article/problem registry helpers
- widget configuration registries

This area is conceptually distinct from runtime/session/policy even if it currently feels "small."

### `src/demo/display`

Owns non-surface rendering helpers and data-to-display projections that feed the shared UI.

Likely files:

- `cardDisplay.ts`
- `regularDisplayView.ts`
- `teachingDisplay.ts`
- `ewVariantView.ts`
- `unknownModeDisplay.ts`
- `unknownModeReplay.ts`

Potential future neighbors:

- additional card/projection/view-model builders

This area is the least architecturally crisp right now, but it is still more coherent than keeping all display helpers flat under `src/demo`.

### `src/demo/settings`

Owns settings UI helpers if that area grows beyond the current session helper.

Current likely occupant:

- possibly only `settingsPanelSession.ts` at first

This subtree is optional in the near term. If settings remains small, it can stay under `session` temporarily.

## Alternative Shapes Considered

### Surface-first split

Example:

- `src/demo/article`
- `src/demo/practice`
- `src/demo/workbench`
- `src/demo/shared`

This is not the preferred direction.

Why:

- it encourages behavior to drift into surface folders
- it makes shared control logic easier to misclassify as article-only or practice-only
- it conflicts with the architecture lesson from recent layout regressions

Surface folders only make sense if they remain clearly limited to framing concerns.

### Rename `src/demo` immediately

Example:

- `src/app`
- `src/experience`
- `src/bridgeApp`

This may eventually be reasonable, because `src/demo` is no longer just a demo in the casual sense.

But doing that rename now would likely create churn without solving the more important internal structure problem.

Near term, internal structure matters more than the top-level name.

## Naming Question: Is `demo` Still The Right Name?

Probably not forever.

The current folder houses:

- app coordination
- product-facing surfaces
- scripted interaction logic
- practice behavior
- shared diagram UI

That is closer to "the app" than "a demo."

But the rename should come later, after:

- the internal substructure is clearer
- the product/app boundary is more stable
- moving the folder would not create extra churn during interaction-profile work

## Migration Rules

If files are moved later, the moves should be:

- small
- boundary-driven
- reversible
- tied to a concrete feature or pain point

Good triggers for moving files:

- a file has a clear new sibling set
- a new feature makes a boundary repeatedly painful
- a helper area has become coherent enough to deserve a subtree

Bad triggers for moving files:

- the folder feels crowded
- a surface happens to use a helper a lot
- a worker wants to "clean up the tree" without a product need

## Safe Incremental Order

If re-tree work becomes worthwhile, a safe order is:

1. Create `script`, `session`, and `diagram` subtrees only when moving files that already clearly belong there.
2. Move registry/config files into `content` when a change is already touching them.
3. Move display-helper files into `display` only after confirming they are not actually surface files in disguise.
4. Reassess whether `settings` deserves its own subtree.
5. Only then consider whether `src/demo` itself should be renamed.

This avoids a large all-at-once tree shuffle.

## What Should Not Move Into Surface Folders

Even if article or practice currently use them heavily, these kinds of things should remain shared or architecture-based:

- transport semantics
- guided-control behavior
- hand-diagram geometry
- status/message layout
- profile-aware navigation behavior
- script/runtime policy

If a move would place one of those under `article` or `practice`, it is probably the wrong move.

## Immediate Conclusion

The likely future answer is not "split by surface" and not "rename everything now."

The likely future answer is:

- keep `src/demo` for now
- gradually add architecture-aligned subtrees inside it
- let those moves follow stable seams and concrete product work

In short:

- current tree pressure is real
- a re-tree probably is justified eventually
- the right first shape is internal substructure inside `src/demo`
- the wrong next step is a cosmetic large-scale move while interaction/profile work is still actively evolving
