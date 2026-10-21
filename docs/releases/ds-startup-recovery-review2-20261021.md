# Recover from diagram startup and DDS failures

Separate diagram startup from optional DDS loading; keep manual play available while DDS loads, bound parent-side waits, make Cancel/Retry decisive, show an independent startup fallback, and include coarse browser/device details in local copyable logs. Remove startup preference downloads and avoidable top-level await. Preserve catalog, provider and DDS assets. Local preparation only; no publication requested. Source-reference freshness remains explicitly omitted as in production; no index refresh.

Base: 686599eb1aca0335484d4fcbe30871571825ca23

Consumer and production tests, typechecks and builds passed.
Source freshness check: explicitly omitted by plan.
Review the local preview before publishing.
