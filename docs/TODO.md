# TODO

## How to use
- Keep entries short and specific; reference logs using `run=<id>` and `idx=<n>` where possible.
- When an item is resolved, add one line under it with the resolution date and commit hash.

## Context
This file tracks active investigation and planning work for replay/branching behavior, threat modeling extensions, and diagnostics quality in the bridge puzzle engine demo. It is intentionally lightweight and operational: checkboxes reflect current status, and notes should point to concrete logs and decision indices.

Current focus is on keeping PlayAgain/replay behavior explainable and reproducible while preserving existing gameplay semantics. Adjacent work includes richer threat representations, handling of pitched threats, and log/test support needed to validate changes safely.

## A) PlayAgain / Replay / Branching (current investigation)
- [ ] Clarify replay invariant: for idx < divergenceIdx, are decisions locked to the recorded prefix, or can they re-branch?
- [ ] Investigate run=6 idx=0 anomaly: `[EQC] classes=busy:S,busy:H` but `[EQC:replayRemaining] availClasses={busy:S}` with `reason=singleton`.
- [ ] If prefix-lock is intended, update logging labels so “singleton” vs “restricted-by-prefix” is distinguishable (logging-only change).
- [ ] If prefix-lock is NOT intended, identify and remove the pruning step that restricts availClasses pre-divergence (behavior change—DO NOT implement now; just note).
- [ ] Add a small “replay modes” note: manual request vs end-of-run vs auto chaining; how candidates are chosen.
- [ ] Add a “definitions” bullet list: availClasses, branchableAvail, classes, computedRemaining, recordedRemaining, runtimeRemaining.

## B) Richer threat types
- [ ] Enumerate desired threat types beyond current model; define inputs/outputs and where they plug in (Threat init, threatLength, threshold, etc.).
- [ ] Define how richer threat types influence defender Inventory EQ tiers (busy/idle) and Action EQ (discard/lead only; follow domain unchanged unless explicitly planned).

## C) Handling pitched threats
- [ ] Define what “pitched threats” means operationally (threat suit shortened? threat card pitched? defender pitched from threat suit?).
- [ ] Specify recomputation rules: when any card in a threat suit is played, reassess that suit and possibly relabel busy/idle dynamically.
- [ ] Identify tests/scenarios to validate pitched-threat handling (small problems first, then p004/p003 equivalents).

## D) Test/Logs support
- [ ] Add/collect minimal repro logs for p003 and p004 that demonstrate the replayRemaining discrepancy with run/visit fields.
- [ ] Define an acceptance checklist for the idle-branching fix (must never offer forcedClass=idle:*; idle multiplicity not branchable).
