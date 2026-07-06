---
"@real-router/core": patch
---

Restore registerTree throughput after the #1263/#1264/#1266 batch (#1285)

That batch added two per-segment costs to every registered route: `markConstrainedParamFork` ran an `extractParamName` regex on every param segment, and `hasNonAsciiSegment` iterated code points (for-of) on every static segment — a stable +5–10% on `registerTree`, which is ~58% of the per-request SSR `cloneRouter` tax. `markConstrainedParamFork` now short-circuits on `!hasConstraints` (the common unconstrained route) before the regex, and `hasNonAsciiSegment` uses a `charCodeAt` index loop (identical result — a surrogate is itself ≥ 0x80). Behaviour-identical; measured back to parity with the pre-batch baseline.
