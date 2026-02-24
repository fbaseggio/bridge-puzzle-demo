# Bridge Cardplay Puzzle Widget (v0.1)

Minimal local-only bridge cardplay puzzle widget with a pure TypeScript engine and a simple browser demo.

## Quick start

1. Install deps:
   ```bash
   npm install
   ```
2. Run demo:
   ```bash
   npm run dev
   ```
3. Build:
   ```bash
   npm run build
   ```
4. Test:
   ```bash
   npm run test
   ```

## Tech

- TypeScript
- Vite
- Vitest
- Plain DOM rendering (no React/Vue)

## Project layout

- `src/core/*`: pure engine logic (no DOM imports)
- `src/puzzles/p001.ts`: required sample puzzle
- `src/demo/main.ts`: browser demo wiring and rendering
- `test/engine.test.ts`: unit tests

## Problem format v0.1

```ts
type Problem = {
  id: string;
  contract: { strain: 'NT' | Suit };
  leader: Seat;
  userControls: Seat[];
  goal: { type: 'minTricks'; side: 'NS' | 'EW'; n: number };
  hands: Record<Seat, Hand>;
  policies: Partial<Record<Seat, { kind: 'randomLegal' }>>;
  rngSeed: number;
};
```

## Engine API

- `init(problem): State`
- `legalPlays(state): Play[]`
- `apply(state, play): StepResult`

`apply` validates, applies the user play, then auto-plays non-user seats until next user turn or end-of-hand.

## Demo verbose mode

- In the browser demo, toggle `Verbose log` to add one-line debug diagnostics.
- Verbose mode appends autoplay decision details, illegal-play context, and a compact post-`apply` state snapshot.
- Default is OFF; regular mode shows only high-level engine events.

## Demo layout and controls

- The board uses a compact cross layout (North top, West left, East right, South bottom) with a center trick table.
- Hands render as four suit rows (`♠ ♥ ♦ ♣`) with ranks in descending order; legal cards on the current user turn are clickable chips.
- Control bar:
  - `Reset`: restart the current puzzle with the same seed.
  - `New seed`: restart with a new seed (`Date.now() >>> 0`).
  - `Show log`: collapse/expand the log panel.
  - `Verbose log`: include extra debug lines in the log.

## Notes on extension

- Trump support can be added in trick resolution by considering `contract.strain` for suit superiority.
- Scripted puzzle lines can be added as additional policies (`kind: 'scripted'`) or a deterministic move list.
- Additional goals can extend `Goal` (for example exact trick targets, avoid side constraints, or defense tasks).
