# Fix fresh analysis worker startup

Separate DOM-free report text from UI rendering so fresh analysis workers initialize and complete DDS-backed analysis. Preserve existing report text and solver behavior; add a required check of the actual emitted worker and real browser analysis.

Website release: 2026-11-17 00:43:12 UTC · 5f2ad26d1627 (release build time, UTC)

Base: 37842dd128c704dbd0689c58c0f90de2afdcb2aa

Consumer and production tests, typechecks and builds passed.
Source freshness check: explicitly omitted by plan.
Review the local preview before publishing.
