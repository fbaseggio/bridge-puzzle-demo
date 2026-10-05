# Catalog, references, Random and Movie release

Prepared October 5, 2026, on live revision 2e9f119c261a9785dbc099d0a5e83eef84827af9.

Includes the reviewed current-discovery catalog (84 display root types, 360 exact records), refreshed source associations (576 queries, 664 citations, 247 citation/root matches), citation-only book references, Random squeeze with balanced family representatives, DDS-filtered AbstractAware defense, and expandable nice solutions on original cards in Random and Movie. Smaller squeezes expand to TTC; TTC expands to a common ordered list of winners. Unsupported analysis remains explicit.

Only compiled consumer pages/assets and this release record are committed. The live home page, bibliography, legacy article/workbench bundles and research data are unchanged. South-on-lead rotation, homepage navigation additions, bibliography additions and DDS failure-UI improvements remain queued. random_dev is not in this release.

Catalog snapshot: sha256:35082a1655ff34fbaa13f8ed4f35089fa21076038420abb27793fdf51f3f2d01, completed discovery batch 13. Catalog and root worker are upgraded together. Source export --check verified all saved evidence hashes before assembly.

Isolated consumer sources: /tmp/ds-squeeze-source-release-20261005.
Consumer build: vite build --config consumers/movie/vite.config.ts --base /movie/ --outDir /tmp/ds-squeeze-bundle-20261005.
Production checkout: /tmp/ds-squeeze-release-20261005.
Replaced public/movie/assets, installed Movie/catalog/source-index/Random HTML, restored /site links, retained DDS under /movie/dds. No source exposition is reintroduced.

Validation: 144 isolated consumer tests and consumer typecheck passed; production typecheck, 408 tests (2 skipped), and production build passed. Seven entry-page asset references validated. Browser checked the production-shaped Movie DDS hint, nice-solution expansion, current catalog root recognition, source-reference links, and Random bootstrap.
