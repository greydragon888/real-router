---
"@real-router/search-schema-plugin": minor
---

The schema now governs `router.buildPath` too (#2087)

Not one line of this package changed. Core's href door runs the `forwardState`
seam this plugin already registers, so the schema reaches `router.buildPath`
without a new hook — which reverses a position three of this package's documents
recorded as deliberate:

> `buildPath` is a pure URL builder. Validation is a navigation-time concern.

That held only while the builder printed what navigation prints. With a route
`defaultSearch` it did not — the href and the click disagreed — and a builder
that prints a different URL is not one anyone can use. `ARCHITECTURE.md`,
`CLAUDE.md` and `README.md` now say so, and the four tests that pinned the bypass
assert the agreement instead.

**What changes for you.** `router.buildPath(...)` output is now schema-shaped:
unknown keys are stripped under `strict`, defaults are applied, and transforms
run. Under `strict` a value the schema rejects no longer reaches the href — it is
replaced by the route default, or dropped, exactly as it is on `navigate`.

One channel is still out of reach: `persistent-params-plugin`'s own `buildPath`
interceptor runs below the merge and after this schema, so a stored value the
schema rejects can still reach the printed URL. That closes with #1938.
