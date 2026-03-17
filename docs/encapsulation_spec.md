# Abstract Encapsulation Specification (Draft v0.2)

Status: Draft, intended for review.

This document defines the intended model for the repository's abstract encapsulation system.
It is written as a normative draft with explicit markers for implementation drift.

- `Spec`: Intended behavior/convention.
- `Current implementation note`: What current TypeScript code does today.
- `Open question / future work`: Unsettled design area.

## 1. Purpose and Scope

### Spec
The abstract encapsulation system defines a compact notation for squeeze-like late-position structures that can be:

1. parsed as abstract suit-level structure,
2. bound to concrete four-hand card deals deterministically (standard binding),
3. optionally transformed to randomized concrete bindings (random binding),
4. approximately inverted from concrete positions for diagnostics/logging.

The abstraction is intended to be portable across implementations and languages.

### Spec
This specification covers:

- syntax and parsing
- symbol semantics
- deterministic standard binding
- random binding (provisional section)
- inversion (single-suit and position-level)
- lineage-aware logging conventions

It does **not** define bridge engine gameplay rules, DDS semantics, or UI behavior except where needed for inversion logging interpretation.

---

## 2. Core Syntax

### Spec
An encapsulation string consists of:

1. optional suit-order header,
2. left suit-string sequence,
3. exactly one lead marker (`<`, `>`, `^`, `v`, or `=`),
4. right suit-string sequence,
5. optional trailing goal offset.

General shape:

```text
[optional-header] <left-suits> <lead-marker> <right-suits> [optional-goal-offset]
```

### Spec
Suit-string separators:

- commas and spaces are equivalent separators between suit strings.
- multiple separators collapse.

Examples:

```text
Wa, a > w
Wa a > w
```

are equivalent.

### Spec
Exactly one lead marker is required in non-empty forms.

### Current implementation note
Current parser enforces exactly one lead marker but currently only accepts `>`, `<`, `=`.
Support for `^` / `v` is specified here but not yet implemented.

---

## 3. Suit-Order Headers

### Spec
Optional explicit suit-order header syntax:

```text
[shdc]
[schd]
[sd]
```

Header letters must be a non-empty permutation prefix of `s h d c` (no duplicates).

### Spec
Header order defines **suit slot order only**.
It does not define primary-side orientation.

### Spec
If no header is present, implicit order is default suit order:

```text
S, H, D, C
```

### Spec
Short headers (e.g. `[sd]`) are valid for compressed standalone forms.

### Spec
If fewer suit strings are provided than header slots, unspecified remaining slots are implicitly empty.
Explicit `0` may still be used where lineage clarity is important.

### Spec
Headers are critical in lineage logging: they preserve suit slots across evolution so suit-level results do not shift columns.

### Current implementation note
Parser supports explicit headers with 1-4 suits; suit count in body must not exceed header length.

---

## 4. Lead Marker Semantics (`<`, `>`, `^`, `v`, `=`)

### Spec
Lead marker indicates the **seat to lead** in the represented abstract position:

- `>`: South leads
- `<`: North leads
- `^`: East leads
- `v`: West leads
- `=`: unresolved/flexible lead

### Spec
In rendered position-level ENCAP output, the lead marker occupies a fixed separator slot between left and right suit-slot groups and must never shift.

### Current implementation note
Position renderer now uses fixed-slot lead separation.
Parser/runtime currently map concrete lead primarily via `>` / `<` / `=`.

### Open question / future work
Final cross-implementation canonicalization for unresolved lead (`=`) in lineage logs remains unsettled.

---

## 5. Primary-Hand Convention and Orientation Model

### Spec
Current system assumes implicit **`[ns]` orientation**:

- suit strings left of lead marker are North-primary slots
- suit strings right of lead marker are South-primary slots

Future orientations (for example `[we]`) are possible but out of scope for this draft.

### Spec
For each suit slot:

- `primary hand` = NS hand owning that slot side
- `opposite hand` = other NS hand
- traversal from primary to opposite defines opponents:
  - first defender encountered = **outbound opponent**
  - second defender encountered = **return opponent**

Seat mapping under current `[ns]` orientation:

- North-primary: outbound = East, return = West
- South-primary: outbound = West, return = East

This outbound/return terminology is normative and replaces drift-prone directional prose.

---

## 6. Symbol Inventory and Intended Meanings

Supported symbols in this draft:

- `w`, `W`, `l`, `L`
- `a`, `A`, `b`, `B`, `c`, `C`
- `i`
- `o`, `u`
- `0` (suit-slot placeholder)

### 6.1 Winner/link symbols

#### Spec
- `W`: winner in primary hand + structural low companion in opposite hand.
- `L`: winner in opposite hand + structural low companion in primary hand.
- `L` denotes a link structure between NS hands.
- `w`: winner in primary hand without opposite structural-low companion.
- `l`: rare/degenerate opposite-hand winner without the corresponding structural-low companion.

#### Spec
`W/L` are paired NS structure operators; they are not isolated card declarations.

#### Current implementation note
Lowercase `l` is implemented but uncommon and less central in current practical inversion behavior.

### 6.2 Threat symbols

#### Spec
Lowercase threat symbols (threat in primary hand):

- `a`: stopped by **return opponent**
- `b`: stopped by **outbound opponent**
- `c`: stopped by both opponents

Uppercase threat symbols mirror this directionality with threat card in opposite NS hand and low companion in primary:

- `A`: opposite-hand threat, stopped by return opponent
- `B`: opposite-hand threat, stopped by outbound opponent
- `C`: opposite-hand threat, stopped by both

#### Spec
Stopper logic requires strictly higher cards than the threat, plus required backing length (defined in standard binding section).

#### Spec
`a`/`b`/`c` describe stopper responsibility; `o`/`u` describe residual opponent-card presence.

#### Worked example (clarifying uppercase stopper side)
Given:

```text
WB =
```

Interpretation:
- suit is North-primary (left side under current `[ns]` orientation),
- `W` binds primary winner + opposite low,
- `B` places the threat in opposite hand with primary low companion,
- stopper side for `B` is **outbound opponent relative to primary**.

Under North-primary, outbound is East, so East receives the stopper holding.

Example standard-bound shape:
- `N: ♠A3`
- `S: ♠J2`
- `E: ♠KQ`  (stoppers for `B`)
- `W: ...` (non-stopper remainder / idle fill)

This example is included because readers often assume uppercase stopper assignment is relative to threat owner; current spec defines it relative to primary orientation.

### 6.3 Idle/structural NS card

#### Spec
`i` indicates an NS-side structural/idle card:

- does not itself impose stopper structure,
- does not by itself increase winner count,
- ensures non-essential NS card presence.

### 6.4 Opponent residual cards

#### Spec
- `o`: one opponent card in the **return opponent**.
- `u`: one opponent card in the **outbound opponent**.

`o/u` are opponent-card directives, not NS cards.

### 6.5 Empty suit placeholder

#### Spec
`0` means explicitly empty suit slot.

`0` contributes no cards and is preserved in lineage/logging where slot continuity matters.

---

## 7. Additional Syntax Features

### 7.1 Goal offset

#### Spec
Optional trailing signed integer goal offset, e.g. `-1`.

If omitted, offset is `0`.

Goal semantics:

- default goal = all remaining tricks = final hand size
- effective goal = `finalHandSize + goalOffset`

Example:

```text
WLa, WB > b', W -1
```

means one fewer than all remaining tricks.

### 7.2 No-idle suit marker (`'`)

#### Spec
Apostrophe `'` on a suit string disables **idle-fill insertion** into that suit.

It does **not** block structurally required cards in that suit.

Example:

```text
b'
WLa'
```

### Current implementation note
`0` is currently parsed as empty suit with idle-fill disallowed for that slot.

---

## 8. Standard Binding (Deterministic)

### Spec
Standard binding converts parsed encapsulation into concrete four-hand cards deterministically.

High-level order:

1. assign suit slots from header/default order,
2. bind winner/link structure (`w/W/l/L`),
3. bind threats (`a/b/c/A/B/C`) using winner-count-based backing requirements,
4. apply tier-2 opponent residuals (`o/u`, right-to-left within suit),
5. determine final hand size,
6. balance hand sizes via deterministic idle fill subject to suit constraints,
7. sort ranks in bridge order.

### 8.1 Rank consumption

#### Spec
Each suit has independent rank pools:

- high pool consumed descending (`A` first),
- low pool consumed ascending (`2` first),
- no duplicate rank in a suit.

### 8.2 Winner count and threat backing

#### Spec
Let winner count in a suit be count of already-bound winner/link letters (`w/W/l/L`) that contribute backing before a threat.

Threat stopper length requirement = `winnerCount + 1`.

- `a` / `A`: return opponent receives required stopper length
- `b` / `B`: outbound opponent receives required stopper length
- `c` / `C`: both opponents each receive required stopper length

Stoppers must be strictly higher than the threat card.

### 8.3 `W/L` structural pairing

#### Spec
`W` and `L` bind paired NS structure:

- `W`: primary winner + opposite structural low
- `L`: opposite winner + primary structural low

Structural lows implied by `W/L` are part of structure, not idle/threat residue.

### 8.4 `i` behavior

#### Spec
`i` contributes NS-side structural idle card without adding stopper obligations.

### 8.5 `o/u` residual behavior

#### Spec
`o/u` encode residual opponent cards after structural/threat assignment:

- `o` in return opponent,
- `u` in outbound opponent.

### 8.6 No-idle behavior

#### Spec
Idle-fill must not add cards into suit slots marked `'`.

### 8.7 Final hand size

#### Spec
Final hand size is computed after structural binding and used for:

- idle fill target
- default goal (before goal offset)

### Current implementation note
Idle-fill priorities are deterministic in current code but still considered implementation policy, not fully frozen normative policy.

### Open question / future work
Specify stricter language-neutral idle-fill priority rules for edge cases.

---

## 9. Random Binding (Provisional)

### Spec
Random binding wraps standard binding, rather than replacing semantics:

1. optional NS swap in abstract form,
2. resolve `=` to concrete lead,
3. suit permutation,
4. run standard binding,
5. per-suit ordinal-preserving rank relabeling with random rank subsets.

### Spec
Ordinal ownership pattern is preserved per suit.

### Current implementation note
This flow exists in current module (`prepareRandomBindingInput` + standard bind + relabel).

### Current implementation note
Current random binding preserves strict per-suit ordinal structure.

### Open question / future work
Some relative-rank relationships may eventually be relaxable while preserving semantics, but this is not part of current behavior.

### Open question / future work
Random idle-card quality still needs improvement.

---

## 10. Inversion / Reverse Encapsulation

### 10.1 Intended single-suit inverse outline

#### Spec
Single-suit inversion should follow a winner-first / structural-low-first outline:

1. identify probable winners,
2. prune winner set appropriately,
3. bind `w/W/l/L`,
4. lock structural lows implied by `W/L`,
5. only remaining unbound NS cards are threat candidates,
6. bind threat symbols (`a/b/c/...`) from stopper/backing behavior,
7. encode remaining opponent residue via `o/u`.

Ambiguity should be surfaced, not silently hidden.

#### Spec
Cards bound as structural lows for `W/L` must not be reinterpreted as threats.

### 10.2 `threatCardIds` tie-break

#### Spec
`threatCardIds` may be used only as a tie-break when multiple structural interpretations are otherwise plausible.
It must not replace structural reasoning.

### 10.3 Position-level inverse

#### Spec
Position-level ENCAP is assembled suit-by-suit in header slot order.

Short-form output uses fixed-slot rendering:

- slot texts in header order,
- fixed lead separator,
- no slot shifting/regrouping.

### 10.4 Lineage-aware inversion

#### Spec
Lineage mode may preserve:

- suit-slot stability
- primary-side continuity
- fixed lead-marker slot
- explicit `0` where useful for continuity

In lineage/runtime logging, inherited primary-side assignment may resolve pure `o|u` ambiguity.

### 10.5 Long-form inversion debug

#### Spec
Verbose/debug mode may emit suit-by-suit explanation, including:

- observed cards
- chosen primary
- winners / structural lows / threat candidates
- stopper checks
- tie-break usage
- lineage `o/u` resolution usage
- per-card binding labels

### Current implementation note
Long-form logging is currently gated by verbose + debug section in analysis mode.

---

## 11. Lineage vs Standalone Encapsulations

### Spec
Two valid representation intents:

1. standalone canonical abstraction (compact local form),
2. lineage-preserving abstraction (slot/primary continuity through sequence).

### Spec
Lineage mode prioritizes continuity invariants over local minimality.

### Open question / future work
Formal canonicalization rules between standalone and lineage outputs remain unsettled.

---

## 12. Worked Examples

### 12.1 Basic

```text
Wa, a > w
```

Assuming default `[shdc]` slot order:

- S (N-primary): `Wa`
- H (N-primary): `a`
- D (S-primary): `w`
- C implicit empty

### 12.2 Headered lineage-oriented form

```text
[schd] Wa, a > w, iooo
```

Later lineage step:

```text
[schd] Wwo, o > 0, ioo
```

Same slots preserved under `[schd]`.

### 12.3 Goal offset and no-idle

```text
WLa, WB > b', W -1
```

- includes no-idle suit (`b'`)
- goal offset `-1`

### 12.4 Opponent directives

```text
Waou
```

`o/u` place residual cards in return/outbound opponents relative to primary.

### 12.5 Reviewed whole-position target

```text
[shdc] wau, WWu > WLc, Wc
```

Example of mixed winner/link/threat/residual structure in fixed slot order.

---

## 13. Open Questions / Implementation Gaps

1. **Inverse formalization depth**
   - Winner-first outline is specified, but full language-neutral algorithm remains incomplete.
   - Current code still includes targeted regression refinements.

2. **`l` semantics stability**
   - Supported, but less central and less tested than `W/L`.

3. **Uppercase threat inversion canonicalization**
   - Binding is supported; inversion canonical choice remains under-specified.

4. **Idle-fill normative policy**
   - Deterministic now, but not frozen as final cross-language norm.

5. **Random idle quality**
   - Structure preservation implemented; quality/tuning remains open.

6. **Standalone vs lineage canonicalization policy**
   - Need explicit criteria for when compact local form may differ from lineage-stable output.

7. **Card-to-symbol association standardization**
   - Concrete-card -> symbol bindings (for example `SA -> w1`, `N2 -> W1-low`) are valuable for debugging and lineage semantics.
   - Not yet fully normative across implementations.

8. **Lead markers `^/v` implementation gap**
   - Spec includes them; parser/runtime currently do not fully support them.

9. **Uppercase stopper reference frame**
   - Current spec assigns uppercase `A/B` stopper side relative to primary orientation (outbound/return from primary).
   - An alternative under consideration is assigning uppercase stopper side relative to the opposite-hand threat owner.
   - This could change interpretations such as `WB =`; treat as open design question until frozen.

---

## 14. Guidance for Reimplementation (Non-TS)

### Spec
A reimplementation should treat parser, binder, and inverse as separate layers:

- parser: syntax + metadata
- binder: deterministic mapping to concrete cards
- inverse: best-fit reconstruction with explicit ambiguity support

### Spec
For compatibility, preserve:

- fixed slot rendering by header order,
- fixed lead separator,
- deterministic standard binding behavior,
- explicit ambiguity surfacing in inverse,
- lineage continuity behavior when lineage mode is requested.

### Current implementation note
The TypeScript implementation is a reference implementation-in-progress, not yet a fully frozen canonical authority.
