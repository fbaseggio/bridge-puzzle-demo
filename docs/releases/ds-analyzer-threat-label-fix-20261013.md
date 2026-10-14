# Fix analyzer threat labels with equivalent winner mappings

Show verified necessary/superficial labels when equivalent mappings occur only in threat-free suits. Retain the guard on ambiguous threat interpretations. Regression covers Wa, a > a, ww: SJ/HK necessary, DK superficial, assessed UU/. No solver, catalog or legacy behavior changes. Published lookup data retained unchanged; current-evidence source freshness check remains explicitly omitted per prior SqWeb scoped exception.

Base: 08984a30c764512033be1dafa4b791723d80231d

Consumer and production tests, typechecks and builds passed.
Source freshness check: explicitly omitted by plan.
Review the local preview before publishing.
