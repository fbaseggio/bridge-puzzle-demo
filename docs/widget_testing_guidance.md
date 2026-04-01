# Widget Testing Guidance

## Purpose

This note captures the testing rules that emerged from the widget snapshot,
scenario, and transport work.

It is aimed at future threads that add or revise tests for:

- article widgets
- scripted widget transport
- scenario pilots
- snapshot/permalink-backed review cases

The goal is not "more tests."

The goal is tests that are:

- connected to the real code
- honest about intent certainty
- clear about which shared seam they actually cover

## Core Rule

Every new widget test should be both:

- code-grounded
- intent-grounded

### Code-grounded

Code inspection should suggest the test will pass today.

This means the test is tied to the real implementation seam, not a shadow
model or a copied behavior guess.

### Intent-grounded

The asserted behavior should match the best current reading of product intent.

If intent is still uncertain, the test should not be presented as a hard
regression lock.

## Scenario Classifications

Use these categories explicitly:

- `locked`
- `review`
- `open-question`

### Locked

Use `locked` only when:

- code inspection suggests the behavior is real today
- intent seems stable enough that drift should fail loudly

### Review

Use `review` when:

- code inspection suggests the behavior is real today
- but a human still needs to confirm whether it is the intended contract

Review scenarios should emit a usable artifact for manual inspection, such as:

- a raw permalink string
- a local artifact file containing review permalinks
- a concise state summary

### Open-question

Use `open-question` when:

- the behavior is still unclear
- or the necessary seam/state is not explicit enough to test honestly

Do not silently upgrade an `open-question` into a `locked` test by guessing.

## Baseline Rule

Pilot start state should come from the real article/widget embed, not from a
copied reconstruction.

At minimum, baseline-parity tests should compare the pilot start snapshot
against the authoritative article iframe URL on:

- problem id
- article script id
- checkpoint id
- `readingProfileEnabledFromUrl`
- `companionPanelEnabledFromUrl`
- `startupGateEnabledFromUrl`

Derived startup posture should then be checked through the live resolver seam,
not another copied constant:

- `resolveWidgetJourneyState(...)`
- `resolveWidgetStartupGatePending(...)`

Keep this parity test narrow.

It is not a demand for full runtime equivalence.

## Shared Seam Rule

Tests and pilots must not silently create a parallel behavior implementation
for semantics they claim to cover.

If a shared seam exists, use it.

Examples:

- prompt-aware transport tests should use
  `articleScriptWidgetTransport`
- progression-only tests may use
  `articleScriptWidgetActionCore`

If a test or pilot does not use the real seam, it must say so plainly.

That is an exposed seam or a temporary compromise, not authoritative coverage.

## Transport Coverage Rule

Be explicit about which layer a test covers.

### Progression-only coverage

These tests cover low-level scripted progression only:

- checkpoint/cursor/history movement
- `start` / `next` / `nextPause` progression steps
- trick-boundary pausing that is already modeled in the low-level core

These tests do **not** automatically cover:

- follow-prompt behavior
- explicit-choice prompt/second-click semantics
- runtime-side message behavior

### Transport-authoritative coverage

Tests that claim to cover real `>` / `>>|` behavior should use the shared
prompt-aware transport seam:

- `articleScriptWidgetTransport`

That seam is the correct home for:

- follow-prompt memory
- explicit-choice prompt/choose behavior
- `nextPause` as repeated `next`
- pause reasons such as:
  - follow prompt
  - explicit-choice prompt
  - trick boundary
  - checkpoint/end

Do not let progression-only pilots be described as covering this layer.

## State-First Assertions

Prefer product-state assertions over rendering assertions.

Good assertions include:

- script cursor
- script history prefix
- startup gate phase
- reveal stage
- active profile
- pending-choice state
- pause reason
- branch state, if the relevant branch memory is explicit

Use DOM/render assertions only when there is no better state seam.

## Shared Consequence Rule

If two different semantic actions can lead to the same downstream consequence,
tests should not rely on one action path as if it were the only way that
consequence can happen.

Examples:

- multiple actions can reveal the same controls density
- multiple actions can require the same repaint
- multiple actions can require the same iframe/embed height update

The preferred shape is:

1. semantic action updates shared state
2. the consequence is derived from that resulting state through one shared path

When reviewing a test seam, ask:

- is this consequence tied to a specific button path?
- or is it derived from the resulting shared state/chrome state?

If the same consequence can arise from multiple semantic actions, at least one
test should cover that the shared consequence path still works for more than
one route.

## Missing State Rule

If a test wants to assert behavior that depends on state not yet carried by the
relevant shared seam or canonical snapshot, do not code around it silently.

Instead:

1. state what state is missing
2. say whether that missing state is:
   - a real product-state omission
   - a session-state omission
   - or an acceptable out-of-scope detail
3. decide whether:
   - the current thread should extract the seam
   - or the test should stay narrower for now

Examples of meaningful missing state:

- `followPromptCursor`
- branch tried/completed/known memory
- other session state that changes what the next button press means

## Review Artifact Rule

For review scenarios, do not rely on fragile clickable chat links.

Prefer:

- raw permalink text blocks
- local artifact files
- widget-shell destinations rather than full article destinations

The point is easy human vetting, not pretty output.

## Prompting Rule For Future Threads

Before implementing new widget tests, the worker should say:

1. why code inspection suggests the test will pass
2. why the behavior is believed to be intended
3. whether the test is:
   - locked
   - review
   - open-question
4. whether the test uses:
   - the real shared seam
   - or a temporary narrower seam with known limits

If the test depends on behavior that is not yet in a shared seam, that should
be called out explicitly before implementation.

## Practical Consequence

The project should be willing to leave behind a list of exposed seams or
missing state, rather than forcing every discovery thread to perform the next
refactor immediately.

What matters is:

- the limitation is named honestly
- tests do not overclaim their authority
- the next extraction is driven by concrete testing or product need

That is preferable to either extreme:

- speculative refactor hunger
- or misleading tests that pass against a shadow model
