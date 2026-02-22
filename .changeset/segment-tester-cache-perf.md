---
"@real-router/helpers": patch
---

Cache compiled RegExp in segment tester functions (#147)

Add per-tester `Map<string, RegExp>` cache inside `makeSegmentTester` so that repeated calls with the same segment string reuse the compiled regex instead of creating a new one each time. Typical improvement: ×15–23 faster, ×17–5,316 less heap on repeated segment checks.
