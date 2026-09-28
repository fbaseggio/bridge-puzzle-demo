# Capital-companion threat review

All five Clash puzzles and the all-tricks legacy case Wwa, WC > Wc, Ww include the implied companion. The two secondary legacy cases explicitly omit it by owner decision.

Coverage: 5 revised Clash puzzles and 3 relevant encapsulation-authored legacy cases.

Diagrams show original hands before any scripted opening or autoplay. “Initial stopping defenders” uses the current threat model on that diagram; it is not a double-dummy result. Entry-dependent strandedness is not applied in this static comparison. Symbols are relative to the threat owner. An unspecified stored symbol means the runtime infers guards from ranks and lengths.

Inversion suggestions are review candidates, not automatic corrections. Full deals and draft diagrams may contain no-fit suits. Full inversions omit a goal offset; the authored encapsulation and explicit goal remain authoritative.

## Revised Clash Squeezes

### 1. Encap: wLa > wA, Lc, WW

ID: `encap_clash_wla_gt_wa_lc_ww__standard`.

Authored encapsulation: `wLa > wA, Lc, WW`.
Full inversion: `[shdc] wLau > wA, Lc, WWoo`.
Leader: South. Strain: NT. Goal: 7 NS tricks.

```text
                 North
                 ♠ A 9 2
                 ♥ J
                 ♦ A
                 ♣ 3 2

West                              East
♠ Q J T                           ♠ 8
♥ K Q                             ♥ T 9
♦ K J                             ♦ Q T
♣ —                               ♣ Q 4

                 South
                 ♠ K
                 ♥ A 2
                 ♦ 9 2
                 ♣ A K
```

Declared threats: ♠9, ♥J, ♦9, ♥2.
Declared resources: none.

| Current threat | Holder | Stored symbol | Initial stopping defenders | Role |
| --- | --- | --- | --- | --- |
| ♠9 | North | `a` | West | threat |
| ♥J | North | `A` | West | threat |
| ♦9 | South | `c` | East, West | threat |
| ♥2 | South | `c` | East, West | threat |

Inversion-suggested threats, including capital companions: North ♠9 (`a`); North ♥J (`A`); South ♥2 (`c`); South ♦9 (`c`).
Suggested but not declared: none.

### 2. Encap: Wa, Lc > wA, Ww

ID: `encap_moon_double_clash_3__standard`. Source: Moon Double Clash 3.

Authored encapsulation: `Wa, Lc > wA, Ww`.
Full inversion: `[shdc] Wau, Lc > wA, Wwo`.
Leader: South. Strain: NT. Goal: 6 NS tricks.

```text
                 North
                 ♠ A J
                 ♥ 9 2
                 ♦ J
                 ♣ 2

West                              East
♠ K Q                             ♠ T
♥ K J                             ♥ Q T
♦ K Q                             ♦ T 9
♣ —                               ♣ Q

                 South
                 ♠ 2
                 ♥ A
                 ♦ A 2
                 ♣ A K
```

Declared threats: ♠J, ♥9, ♦J, ♦2.
Declared resources: none.

| Current threat | Holder | Stored symbol | Initial stopping defenders | Role |
| --- | --- | --- | --- | --- |
| ♠J | North | `a` | West | threat |
| ♥9 | North | `c` | East, West | threat |
| ♦J | North | `A` | West | threat |
| ♦2 | South | `c` | East, West | threat |

Inversion-suggested threats, including capital companions: North ♠J (`a`); North ♥9 (`c`); North ♦J (`A`); South ♦2 (`c`).
Suggested but not declared: none.

### 3. Encap: WLa, wB > wc, WL

ID: `encap_moon_double_clash_5__standard`. Source: Moon Double Clash 5.

Authored encapsulation: `WLa, wB > wc, WL`.
Full inversion: `[shdc] WLau, wB > wc, WLoo`.
Leader: South. Strain: NT. Goal: 7 NS tricks.

```text
                 North
                 ♠ A 9 3
                 ♥ A 2
                 ♦ —
                 ♣ K 2

West                              East
♠ Q J T                           ♠ 8
♥ K Q                             ♥ T 9
♦ K J                             ♦ Q T
♣ —                               ♣ Q 4

                 South
                 ♠ K 2
                 ♥ J
                 ♦ A 9
                 ♣ A 3
```

Declared threats: ♠9, ♥J, ♦9, ♥2.
Declared resources: none.

| Current threat | Holder | Stored symbol | Initial stopping defenders | Role |
| --- | --- | --- | --- | --- |
| ♠9 | North | `a` | West | threat |
| ♥J | South | `B` | West | threat |
| ♦9 | South | `c` | East, West | threat |
| ♥2 | North | `c` | East, West | threat |

Inversion-suggested threats, including capital companions: North ♠9 (`a`); South ♥J (`B`); North ♥2 (`c`); South ♦9 (`c`).
Suggested but not declared: none.

### 4. Encap: [schd] wa, Ww > wA', Wci

ID: `encap_moon_double_clash_7__standard`. Source: Moon Double Clash 7.

Authored encapsulation: `[schd] wa, Ww > wA', Wci`.
Full inversion: `[schd] wau, Wwou > wA', Wci`.
Leader: South. Strain: NT. Goal: 6 NS tricks.

```text
                 North
                 ♠ A J
                 ♥ Q
                 ♦ 2
                 ♣ A K

West                              East
♠ K Q                             ♠ T
♥ K                               ♥ J T
♦ K J                             ♦ Q T
♣ J                               ♣ Q

                 South
                 ♠ —
                 ♥ A 2
                 ♦ A 9 3
                 ♣ 2
```

Declared threats: ♠J, ♥Q, ♦9, ♥2.
Declared resources: none.

| Current threat | Holder | Stored symbol | Initial stopping defenders | Role |
| --- | --- | --- | --- | --- |
| ♠J | North | `a` | West | threat |
| ♥Q | North | `A'` | West | threat |
| ♦9 | South | `c` | East, West | threat |
| ♥2 | South | `a` | East | threat |

Inversion-suggested threats, including capital companions: North ♠J (`a`); North ♥Q (`A'`); South ♥2 (`a`); South ♦9 (`c`).
Suggested but not declared: none.

### 5. Type R Clash-B

ID: `encap_moon_hex_clash_2__standard`. Source: Moon hex clash 2.

Authored encapsulation: `[schd] wA' Ww > WLc, c`.
Full inversion: `[schd] wA', Wwu > WLc, c`.
Leader: South. Strain: NT. Goal: 6 NS tricks.

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

Declared threats: ♠Q, ♥6, ♦Q, ♠2.
Declared resources: none.

| Current threat | Holder | Stored symbol | Initial stopping defenders | Role |
| --- | --- | --- | --- | --- |
| ♠Q | South | `A'` | East | threat |
| ♥6 | South | `c` | East, West | threat |
| ♦Q | South | `c` | East, West | threat |
| ♠2 | North | `a` | West | threat |

Inversion-suggested threats, including capital companions: South ♠Q (`A'`); North ♠2 (`a`); South ♥6 (`c`); South ♦Q (`c`).
Suggested but not declared: none.


## Reviewed legacy capital-companion cases

### 1. Encap: WLa, WB > b', W -1

ID: `encap_wla_wb_gt_b_w`.

Companion decision: **omit**, explicitly approved for this secondary squeeze.
Authored encapsulation: `WLa, WB > b', W -1`.
Full inversion: `[shdc] WLau, WB > b, Wooo`.
Leader: South. Strain: NT. Goal: 5 NS tricks.

```text
                 North
                 ♠ A 9 3
                 ♥ A 3
                 ♦ —
                 ♣ 2

West                              East
♠ Q J T                           ♠ 8
♥ K Q                             ♥ T 9
♦ A                               ♦ —
♣ —                               ♣ K 4 3

                 South
                 ♠ K 2
                 ♥ J 2
                 ♦ K
                 ♣ A
```

Declared threats: ♠9, ♥J, ♦K.
Declared resources: none.

| Current threat | Holder | Stored symbol | Initial stopping defenders | Role |
| --- | --- | --- | --- | --- |
| ♠9 | North | `a` | West | threat |
| ♥J | South | `B` | West | threat |
| ♦K | South | `b` | West | threat |

Inversion-suggested threats, including capital companions: North ♠9 (`a`); South ♥J (`B`); North ♥3 (`c`); South ♦K (`b`).
Suggested but not declared: North ♥3 (`c`).

### 2. Encap: WLau, WAuu > b, Wo -1

ID: `encap_wlau_waouou_gt_b_wo`.

Companion decision: **omit**, explicitly approved for this secondary squeeze.
Authored encapsulation: `WLau, WAuu > b, Wo -1`.
Full inversion: `[shdc] WLau, WAuu > b, Wo`.
Leader: South. Strain: NT. Goal: 5 NS tricks.

```text
                 North
                 ♠ A 9 3
                 ♥ A 3
                 ♦ —
                 ♣ 2

West                              East
♠ Q J T                           ♠ 4
♥ T 9                             ♥ K Q 5 4
♦ A                               ♦ —
♣ —                               ♣ 3

                 South
                 ♠ K 2
                 ♥ J 2
                 ♦ K
                 ♣ A
```

Declared threats: ♠9, ♥J, ♦K.
Declared resources: none.

| Current threat | Holder | Stored symbol | Initial stopping defenders | Role |
| --- | --- | --- | --- | --- |
| ♠9 | North | `a` | West | threat |
| ♥J | South | `A` | East | threat |
| ♦K | South | `b` | West | threat |

Inversion-suggested threats, including capital companions: North ♠9 (`a`); South ♥J (`A`); North ♥3 (`c`); South ♦K (`b`).
Suggested but not declared: North ♥3 (`c`).

### 3. Encap: Wwa, WC > Wc, Ww

ID: `encap_wwa_wc_gt_wc_ww`.

Authored encapsulation: `Wwa, WC > Wc, Ww`.
Full inversion: `[shdc] Wwau, WC > Wc, Wwoo`.
Leader: South. Strain: NT. Goal: 7 NS tricks.

```text
                 North
                 ♠ A K 9
                 ♥ A 3
                 ♦ 2
                 ♣ 2

West                              East
♠ Q J T                           ♠ 8
♥ K J                             ♥ Q T
♦ K J                             ♦ Q T
♣ —                               ♣ Q 3

                 South
                 ♠ 2
                 ♥ 9 2
                 ♦ A 9
                 ♣ A K
```

Declared threats: ♠9, ♥9, ♦9, ♥3.
Declared resources: none.

| Current threat | Holder | Stored symbol | Initial stopping defenders | Role |
| --- | --- | --- | --- | --- |
| ♠9 | North | `a` | West | threat |
| ♥9 | South | `C` | East, West | threat |
| ♦9 | South | `c` | East, West | threat |
| ♥3 | North | `c` | East, West | threat |

Inversion-suggested threats, including capital companions: North ♠9 (`a`); South ♥9 (`C`); North ♥3 (`c`); South ♦9 (`c`).
Suggested but not declared: none.
