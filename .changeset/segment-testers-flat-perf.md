---
"@real-router/route-utils": patch
---

Segment testers match via flat string comparisons — no RegExp engine (#1432)

`startsWithSegment` / `endsWithSegment` / `includesSegment` no longer build and execute cached RegExps: matching reduces to prefix/suffix/occurrence checks with a dot-or-edge boundary, exactly equivalent to the historical patterns (property-locked against an inline regex reference). Validation is unchanged and still once-per-segment. Cuts the cold-path cost every adapter's `RouteView` pays per navigation — react deep-config@90: **−31 % totalMs** (conservative ABAB browser A/B).
