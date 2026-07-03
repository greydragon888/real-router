---
"@real-router/route-utils": patch
---

Fix curried segment testers returning a boolean for an empty/non-string route name (#769)

`startsWithSegment` / `endsWithSegment` / `includesSegment` promise a tester function for the single-argument (curried) form, but the route-name validation short-circuited to `false` before the currying branch. A single-arg call on an empty or non-string route name returned a boolean typed as a function, crashing with an unrelated `TypeError` at the eventual call site.

- Defer the route-name check (computed once as `invalidName`) into each return path so the single-arg form always yields a `(segment: string) => boolean` tester, and that tester returns `false` for any segment.
- Direct-form output is unchanged: an empty/non-string name still returns `false` (the check runs before the segment-type guard, so no new `TypeError`).
