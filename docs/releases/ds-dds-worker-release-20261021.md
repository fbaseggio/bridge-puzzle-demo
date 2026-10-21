# Publish cancellable DDS workers and persistent loading allowances

Move DDS loading and calculation into dedicated workers for Movie, Random, Random Dev and Squeeze Analyzer Dev. Add persistent 30-second, 2-minute and 10-minute loading choices, elapsed status, Cancel, manual Retry and copyable activity. Preserve cards/history and non-DDS fallback defense. Catalog, source associations and provider/DDS assets remain pinned and unchanged. Source-reference freshness remains explicitly omitted as in the production base; no refresh is included.

Base: 9e7b69ad2c88aaaf8749bc885f4f24c598b603f7

Consumer and production tests, typechecks and builds passed.
Source freshness check: explicitly omitted by plan.
Review the local preview before publishing.
