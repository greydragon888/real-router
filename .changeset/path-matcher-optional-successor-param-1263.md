---
"@real-router/core": minor
---

Match an optional param directly followed by a required param (#1263)

`/:a?/:b` bound a single-segment URL under the optional's name (`match("/x")` → `{ a: "x" }`) instead of the successor's (`{ b: "x" }`), and `/:a<\d+>?/:b` was unmatchable when the optional was omitted — `buildPath` emitted a dead deep-link. The omit form is now disambiguated by segment count: because it is one segment shorter, on the LAST segment the optional is omitted and the segment binds under the successor's name. The optional's own constraint is validated only when it is present (≥2 segments). Consecutive optionals (`/:a?/:b?/…`) are unchanged.
