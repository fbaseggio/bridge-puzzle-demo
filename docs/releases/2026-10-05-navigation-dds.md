# Random navigation, DDS diagnostics and bibliography release

Based on live revision a74922607b4a7aa492d68a376682d5f5fc9f3f5c. Authorized October 5, 2026.

Includes South-on-lead bindings and next-deal double-chevron controls on both Random pages; home destinations ordered Catalog, Random, Articles, Puzzles, Practice, Workbench; Random in the Movie header; and the seven queued French/Kelsey/Kennedy bibliography entries.

Publishes /random_dev/ as an unlinked experimental page, with an expandable DDS status/log pane, bounded initialization, one automatic retry, and manual engine reload without resetting cards/history. Failed or unmappable analysis pauses assisted play. Normal Random retains its existing DDS loader; the experimental runtime is an opt-in consumer. Smaller squeeze/TTC expansions and AbstractAware defense from the previous release remain included.

The previous release's producer and catalog snapshot are retained. No new discovery refresh, producer edits, research-data changes, or source exposition. Only compiled consumer entries/assets, the home page, credits page and release records are published. Shared research commits are not pushed.

Isolated source: /tmp/ds-navigation-source-release-20261005, overlaid on /tmp/ds-squeeze-source-release-20261005. Source hashes accompany this report.
Consumer build: vite build --config consumers/movie/vite.config.ts --base /movie/ --outDir /tmp/ds-navigation-bundle-20261005.
Production checkout: /tmp/ds-navigation-release-20261005.

Validation: 150 consumer tests and typecheck passed; production typecheck, 408 tests (2 skipped), and build passed. All nine consumer entry pages have valid local asset references. Browser checked homepage order, both Random next-deal buttons, South leads, and the disposable DDS runtime under production asset paths. Prior fault-injection checks covered missing engine files, mid-play solver exceptions, preserved history and recovery.
