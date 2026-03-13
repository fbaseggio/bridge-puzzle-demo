Place browser DDS runtime files here.

Expected runtime surface:
- global `nextPlays(pbn, trump, plays)` function

Expected trump codes:
- N, S, H, D, C

Expected plays encoding:
- ["AH", "4D", ...] (rank+suit)

If DDS runtime is not present, the demo will keep running and emit a concise
verbose diagnostic like:
  [DDS] ... unavailable: runtime-missing

This folder is served by Vite in dev and by static hosting (including GitHub Pages)
at <base>/dds/...
