# Card Presentation Standard

## Purpose

This note defines a shared presentation standard for cards, suits, and short card tokens across the demo app.

It exists to keep the visual language of:

- suit symbols
- ranks
- card tokens
- semantic highlighting

consistent across the product, even when those cards appear in different contexts.

This is a presentation standard, not a gameplay or semantic-policy standard.

It should sit orthogonally to:

- engine/runtime
- interaction policy
- session state
- surface framing

## Status

This is a specification and rollout target.

It should be implemented incrementally with a touch-only migration strategy.

Do **not** do a one-shot rewrite of every card and suit rendering path just to satisfy this standard.

The rule is:

- when a card/suit presentation context is touched for real product work, migrate it toward this standard

## Goals

- preserve a strong, recognizable visual identity for cards and suits across contexts
- avoid ad hoc suit/rank markup and CSS duplication
- make semantic highlighting feel like one family instead of several unrelated patches
- support both plain card identity and semantic emphasis
- allow different contexts to vary in size/density without changing the core visual language

## Non-goals

- redesign all semantic coloring rules
- unify every card-like context into identical DOM immediately
- replace the underlying semantic card-display projection system
- force a full refactor of existing render code before new product work can continue

## Core Concepts

### Card identity

A card token is the shared visual unit for expressing a single bridge card or a short card-like token.

At minimum it contains:

- rank
- suit glyph

It may optionally carry semantic emphasis.

### Presentation context

Contexts express where a card token is being rendered and what density/scale it should use.

Initial supported contexts:

- `diagram-row`
- `played-card`
- `best-chip`
- `contract-strain`
- `inline-card`

These contexts should share the same visual family, not necessarily identical DOM scale.

### Presentation mode

Presentation mode answers how semantic emphasis is shown.

Initial modes:

- `base`
- `semantic-color`
- `semantic-box`
- `mixed`

These are presentation modes, not gameplay semantics.

They should describe visual treatment, not why a card is important.

## Context Definitions

### `diagram-row`

Used in hand rows inside the main diagram.

Characteristics:

- dense
- highly legible at small sizes
- most likely to carry semantic color/box emphasis
- should remain visually stable across many repeated cards

### `played-card`

Used in trick-table / played-card slots.

Characteristics:

- slightly more prominent than `diagram-row`
- suit and rank should read clearly at a glance
- can carry semantic emphasis, but identity remains primary

### `best-chip`

Used for compact best-card hints such as `BEST:` chips.

Characteristics:

- small standalone token
- should still look like the same card language as diagram/played-card contexts
- must not become a completely separate badge design family

### `contract-strain`

Used where a strain/suit appears as compact contract metadata.

Characteristics:

- suit-forward
- does not need full card-token structure
- should still use the same suit glyph family and color rules

### `inline-card`

Used in prose or companion/status contexts where card identity appears inside a line of text.

Characteristics:

- text-adjacent
- may be plain-text or lightweight token markup depending on context
- should preserve the same rank/suit feel without disrupting reading flow

## Semantic Modes

### `base`

Plain card identity with no semantic emphasis beyond standard suit coloring.

Use when:

- identity matters
- semantic meaning is irrelevant or already communicated elsewhere

### `semantic-color`

Card identity plus semantic color treatment.

Use when:

- color conveys semantic state
- boxing would be too heavy for the context

This should be the most common semantic treatment in dense contexts.

### `semantic-box`

Card identity plus semantic box/border treatment.

Use when:

- emphasis must remain visible even when color is subtle
- the user needs a stronger local signal such as good-vs-bad alternatives

### `mixed`

Card identity plus both color and box treatment.

Use sparingly.

Use when:

- the context truly needs both channels
- existing behavior already relies on both

Do not default to this mode just because it is available.

## Typography And Layout Tokens

This section defines the intended visual rules.

The implementation may translate these into CSS variables, helper defaults, or shared classes.

### General rank rules

- ranks should carry most of the weight of card identity
- rank weight should be medium-to-semibold, not ultra-bold
- rank spacing should stay tight enough to read as a card token, not as prose text
- `A K Q J T 9 ... 2` must remain highly legible at small widget sizes

### General suit rules

- suit glyphs should remain slightly lighter and more compact than ranks
- suit glyph spacing from rank should be small and consistent
- suit glyphs should not visually dominate rank text in dense contexts
- the same suit glyph family should be used across all contexts

### `10` rule

Use `T` internally and in compact token contexts unless a specific prose-oriented context explicitly requires `10`.

Implications:

- `diagram-row`: use `T`
- `played-card`: use `T`
- `best-chip`: use `T`
- `contract-strain`: not applicable
- `inline-card`: default to `T`, but allow future explicit prose exceptions if product work requires them

Do not mix `10` and `T` casually across neighboring contexts.

### Spacing rules

- rank-suit spacing must be shared within the card-token family
- chip padding and boxed emphasis may vary by context, but should derive from one shared family
- inline tokens should remain compact enough to sit in text without creating awkward line-height jumps

## Suit Colors

Base suit colors should remain consistent across contexts:

- black suits:
  - spades
  - clubs
- red suits:
  - hearts
  - diamonds

These suit colors are identity colors, not semantic colors.

Semantic color classes must layer on top of this system without redefining suit identity arbitrarily.

## One Source Of Truth

The product should converge toward one presentation helper module:

- `src/demo/cardPresentation.ts`

Target APIs:

- `renderSuitGlyph(suit, opts)`
- `renderCardToken(cardId, opts)`
- `formatCardText(cardId, opts)`

### `renderSuitGlyph(suit, opts)`

Use for:

- contract strain
- suit-only compact metadata
- any shared suit-only markup

### `renderCardToken(cardId, opts)`

Use for:

- played cards
- best chips
- inline card tokens when DOM markup is appropriate
- eventually diagram-row tokens as touched

`opts` should at least support:

- `context`
- `mode`
- optional semantic class/state
- optional ARIA/label adjustments

The helper should stay presentation-focused.

It should not derive semantic meaning from raw game state on its own.

### `formatCardText(cardId, opts)`

Use for:

- text-only contexts
- logs or labels that must remain plain text
- inline content where DOM token markup is not appropriate

This is the single source of truth for text formatting rules such as the `T` rule.

## CSS Namespace

The product should converge toward one shared CSS namespace for card presentation.

Required shared classes:

- `.card-token`
- `.card-rank`
- `.card-suit`

Likely modifier classes:

- `.card-token--diagram-row`
- `.card-token--played-card`
- `.card-token--best-chip`
- `.card-token--inline`
- `.card-token--semantic-blue`
- `.card-token--semantic-green`
- `.card-token--semantic-amber`
- `.card-token--semantic-purple`
- `.card-token--semantic-grey`
- `.card-token--boxed`
- `.card-token--mixed`

Important rule:

Do not create new ad hoc suit/rank styling outside this namespace for product UI card tokens unless there is a strong reason and it is explicitly documented.

Context-specific layout containers are fine.

Context-specific suit/rank visual systems are not.

## Relationship To Existing Semantic Coloring

Semantic card meaning already has a projection pipeline in files such as:

- `src/demo/cardDisplay.ts`

This standard should not replace that semantic projection layer.

Instead:

- semantic projection decides *what* semantic state a card has
- card presentation decides *how* that state is rendered visually

That separation should remain explicit.

## Rollout Strategy

Use touch-only rollout.

That means:

- no large migration for its own sake
- when a context is touched, migrate it toward shared helper/classes

### Highest-value first migrations

Current likely high-value contexts:

- `src/demo/main.ts`
  - diagram rows
  - played cards
  - contract strain
- `src/demo/handDiagramNavigation.ts`
  - `BEST:` chips

### Lower-priority contexts

- inline/prose uses
- companion-panel card mentions
- other status/meta card tokens

## Guardrails

### Code-review rule

Avoid new direct UI formatting of `suitSymbol + rank` outside the shared helper/module.

This does not forbid internal card ids or game logic using `CardId`.

It only forbids introducing new ad hoc product-UI formatting when the helper should be used.

### Tests

Add lightweight tests for:

- helper output shape
- `T` formatting rules
- suit glyph labeling/ARIA basics
- context/mode class application

### Visual fixture

Add one visual fixture/demo page or section that shows:

- all initial contexts
- base mode
- semantic-color mode
- semantic-box mode
- mixed mode

This does not need to be a polished documentation site.

It only needs to make regressions and inconsistencies inspectable.

## Implementation Guidance

### What to standardize first

Standardize:

- suit glyph markup
- rank markup
- token class names
- text formatting rules
- semantic presentation class hooks

### What not to over-design immediately

Do not over-design:

- every possible token variant
- every prose use case
- a perfect abstraction for all renderers
- a full migration plan for untouched code

The first implementation should be good enough to stabilize the family resemblance and stop further drift.

## Practical Rule Of Thumb

When a worker touches a card/suit rendering path, ask:

- is this rendering a card or suit for product UI?
  - use the shared standard
- is this just game logic or internal text?
  - helper may not be needed
- is this introducing a new visual language for the same card identity?
  - probably wrong unless explicitly justified
