# Puzzle onboarding checklist

Draft under development. This records the review of a proposed puzzle before adding it to a practice set. Further review steps will be defined as we work through the candidate; completing the checks below does not yet authorize adding it to the set.

## Running the checklist

The automated parts of sections 1 and 2 are available as one command. Substitute the next candidate's encapsulation, title, and source:

```sh
npm run puzzle:onboard -- \
  --encap "[schd] wA' Ww > WLc, c" \
  --title "Type R Clash-B" \
  --source "Moon hex clash 2"
```

The command writes a newspaper-layout Markdown review and a JSON record under `logs/onboarding/`. These local reports are ignored by Git; retain an approved review in documentation when appropriate. Use `--out path/to/report` to choose a basename (the command appends `.md` and `.json`; an existing pair at that basename is replaced).

The report includes the standard binding, specified and idle counts, original-to-E1 comparison, E1-to-E2 stability, all opening-play DDA scores, and each independent cook check against the original trick target. Bindings with unequal hands or negative idle counts are invalid for DDA. Binding and solver failures are inconclusive, never successful cook checks. Original and modified deals use the same strain and leader.

Options:

- `--strain NT|S|H|D|C`: default notrump.
- `--leader N|S`: required for a flexible `=` lead; an override conflicting with `<` or `>` is rejected.
- `--python PATH`: Python interpreter containing `endplay`. Defaults to the project's `.venv/bin/python` if present, otherwise `python3`. Each query runs in a separate process with a 60-second timeout. Native solver errors are captured in the report; on this machine DDS must run outside the execution sandbox.
- `--skip-dda`: run the encapsulation checks only; the report remains incomplete.
- `--allow-additional-threats "reason"`: record explicit per-candidate permission for additional lowercase `a/b/c`, including agreed idle absorption. Existing test-fixture permissions are not inherited.
- `--omit-original-comparison "reason"`: record explicit permission to omit original-to-E1 comparison for a representation exception. E1-to-E2 stability is still checked.
- `--help`: show usage.

Exit codes are `0` for automated checks passed, `1` for findings needing review, and `2` for incomplete checks or invalid input. Human review remains pending in every case; the command never adds a puzzle to a practice set. This implements the currently agreed checklist, not any future review steps.

The automated smoke test reproduced the current candidate's results: stable structure, six tricks with only ♣2 winning, and five tricks after its sole `A' → A` tweak.

## Clash Squeezes candidates

Direct practice link: [Clash Squeezes, Set 5](https://deepsqueeze.ai/practice/?set=5). It opens the first puzzle in the agreed order. Selecting another practice set updates the URL so that set can also be shared.

The owner approved adding all five candidates to **Set 5 — Clash Squeezes**, in the order **3, 4, 5, 2, 1** below. They are now registered with their reviewed standard bindings, and the practice queue preserves that order across sessions. The table retains onboarding candidate order for reference. The generated reports remain historical records of the checks before approval.

| Encapsulation | Title | Source | Status | Automated result |
| --- | --- | --- | --- | --- |
| `[schd] wA' Ww > WLc, c` | Type R Clash-B | Moon hex clash 2 | Added to Set 5 | 6/6; only ♣2 wins; sole cook tweak yields 5 |
| `[schd] wa, Ww > wA', Wci` | Not specified | Moon Double Clash 7 | Added to Set 5 | 6/6; ♥A and ♣2 win; both cook tweaks yield 5 |
| `wLa > wA, Lc, WW` | Not specified | Not specified | Added to Set 5 | 7/7; ♣A and ♣K win; both cook tweaks yield 6 |
| `Wa, Lc > wA, Ww` | Not specified | Moon Double Clash 3 | Added to Set 5 | 6/6; ♣A and ♣K win; both cook tweaks yield 5 |
| `WLa, wB > wc, WL` | Not specified | Moon Double Clash 5 | Added to Set 5 | 7/7; ♣A and ♣3 win; both cook tweaks yield 6 |

The third candidate uses the default suit order `[shdc]`, notrump, and South to lead. Its original structure is preserved, with stable E1 = E2: `[shdc] wLau > wA, Lc, WWoo`. The two independent cook checks change the spade `a` to `c` and the heart `A` to `C`.

The fourth candidate also uses `[shdc]`, notrump, and South to lead. Its original structure is preserved, with stable E1 = E2: `[shdc] Wau, Lc > wA, Wwo`. Its independent spade `a → c` and diamond `A → C` tweaks each reduce the maximum to five tricks. Every non-club opening in the original also yields five tricks.

The fifth candidate uses `[shdc]`, notrump, and South to lead. Its original structure is preserved, with stable E1 = E2: `[shdc] WLau, wB > wc, WLoo`. Its independent spade `a → c` and heart `B → C` tweaks each reduce the maximum to six tricks. Every non-club opening in the original also yields six tricks.

## First candidate review record

Current candidate:

- Title: **Type R Clash-B**.
- Source: **Moon hex clash 2** (source title; no author or URL specified).
- Intended set: **Clash Squeezes** (Set 5).
- Proposed encapsulation: `[schd] wA' Ww > WLc, c`.
- Contract strain: notrump. South leads.
- Original trick target: **6 of 6**.
- Status: sections 1, 2.1, and the currently specified cook checks in 2.2 complete; owner approved addition to Set 5 as its fifth puzzle.
- Review started: 2026-09-27.

## 1. Encapsulation vetting

- [x] Bind the proposed encapsulation with the standard binder and display the deal in newspaper layout.
- [x] Check the hand size, specified card counts, and idle completion. Report any negative idle counts or unequal hands.
- [x] Confirm the leader, strain, and intended trick target, including any goal offset.
- [x] Invert the first binding to E1 and compare it with the original encapsulation.
- [x] Bind E1 and invert again to E2; verify E1 equals E2.

For the original-to-E1 comparison, preserve the authored structure and idle-card counts, allowing additional `o/u/i/m` cards. Additional lowercase threats and representation exceptions require explicit per-case permission. Token modifiers such as `A'` and `B*` are structural. Lead, goal offset, and suit-level no-idle markers are checked separately, since inversion does not necessarily preserve them.

### Current result

```text
                 North
                 ♠ A 2
                 ♥ K 2
                 ♦ —
                 ♣ A K

West                              East
♠ J T                             ♠ K
♥ Q T 8                           ♥ J 9 7
♦ A                               ♦ K
♣ —                               ♣ Q

                 South
                 ♠ Q
                 ♥ A 6 3
                 ♦ Q
                 ♣ 2
```

| Hand | Specified cards | Idle cards added | Final size |
| --- | ---: | ---: | ---: |
| North | 6 | 0 | 6 |
| East | 5 | 1 (♣Q) | 6 |
| South | 6 | 0 | 6 |
| West | 6 | 0 | 6 |

```text
Original: [schd] wA' Ww > WLc, c
E1:       [schd] wA', Wwu > WLc, c
E2:       [schd] wA', Wwu > WLc, c
```

Pass: original structure survives; the only added symbol is the club `u` for East's idle card. E1 equals E2. No special comparison permissions were needed.

## 2. Double-dummy analysis (DDA)

### 2.1 Confirm the original deal

- [x] Run DDA on the actual bound deal, with the intended strain and leader.
- [x] Confirm the maximum tricks available to N/S.
- [x] Identify every first play that achieves the intended trick target.

The local project virtual environment contains `endplay` 0.5.12. The existing `DoubleDummyValidator` in `tools/policy_movie.py` uses `endplay.dds.solve_board`. The default system `python3` does not have this package; use `.venv/bin/python`.

This candidate also served as the local solver smoke test. Native DDS initialization failed inside the execution sandbox, but the same installed solver ran successfully outside it. All six legal first plays were scored. The existing validator and DDS's explicit `OptimalAll` mode agreed on the best opening.

Reproduction data (PBN, hands in N/E/S/W order; notrump, South to lead):

```text
N:A2.K2..AK K.J97.K.Q Q.A63.Q.2 JT.QT8.A.
```

| South's first play | Maximum N/S tricks |
| --- | ---: |
| **♣2** | **6** |
| ♠Q | 5 |
| ♥A | 5 |
| ♥6 | 5 |
| ♥3 | 5 |
| ♦Q | 5 |

Pass: the maximum is **6 tricks**, and **♣2 is the sole first play achieving 6**.

### 2.2 Check for cooks

For each agreed tweak, modify the encapsulation, generate its standard binding, and run DDA. The test is whether the modified position can still achieve the **original trick target**, not a newly inferred target from the modified encapsulation.

Apply these tweaks **one token at a time, independently from the original**, never cumulatively:

1. Change an unmodified `a` or `b` to `c`, preserving capitalization (`A/B` to `C`).
2. Remove the apostrophe from one `A'`, `B'`, `g'`, or `G'` token.

`A'` and `B'` are distinct compound tokens. Converting `A'` to `C` would combine two changes and is not required; do not treat it as an `A`-to-`C` test. The same distinction applies to `B'`.

- [x] Identify each applicable single-token tweak.
- [x] Record each exact modified encapsulation and its bound deal, hand sizes, strain, and leader.
- [x] Confirm the modified binding is valid before interpreting its DDA result.
- [x] Record the maximum N/S tricks and any first plays reaching the original target.
- [x] Confirm each modified position falls short of that target, or report the surviving success as a cook for review.

For this candidate, the reference target is **6 tricks**. A valid modified deal scoring fewer than 6 passes that cook check. A score of 6 or more identifies a cook under the agreed tweak. A binding failure, solver error, or skipped analysis is inconclusive, not a passed check.

### Current cook-check result

The original contains no unmodified `a/b/A/B` tokens. Its only applicable tweak is **`A'` → `A`**:

```text
Original: [schd] wA' Ww > WLc, c
Modified: [schd] wA Ww > WLc, c
```

The modified standard binding has six specified cards in every hand, with no idle completion. South leads in notrump; the reference target remains six tricks.

```text
                 North
                 ♠ A 2
                 ♥ K 2
                 ♦ —
                 ♣ A K

West                              East
♠ T 9                             ♠ K Q
♥ Q T 8                           ♥ J 9 7
♦ A                               ♦ K
♣ —                               ♣ —

                 South
                 ♠ J
                 ♥ A 6 3
                 ♦ Q
                 ♣ 2
```

PBN reproduction data:

```text
N:A2.K2..AK KQ.J97.K. J.A63.Q.2 T9.QT8.A.
```

DDA maximum: **5 tricks**. Each legal opening (♠J, ♥A, ♥6, ♥3, ♦Q, ♣2) scores 5; none reaches 6. The validator and DDS's `OptimalAll` mode agree.

**Pass: no cook found under the applicable tweak.** The owner subsequently approved adding the candidate to Set 5, where it is the fifth puzzle.
