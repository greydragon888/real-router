---
"@real-router/core": patch
---

Correct the ingestion primitive's affordability figure (#2116)

`storeDependency`'s docblock carried `1.35–1.65×` for the cost of routing a
null-prototype write through `putField`. Five clean re-runs put the band at
`1.26–1.34×`; the old upper end came from a contended run.

The bench arm that produced the comparison is also fixed: three arms named
`Object.assign/*` built `{ ...source }`, a spread, so the committed file could
not reproduce its own published numbers. They call `Object.assign` now, with the
lint suppression that keeps `unicorn/no-immediate-mutation`'s autofix from
rewriting them back into a spread, and the spread is kept as a separately named
arm because it costs about a quarter as much and is a different operation.
