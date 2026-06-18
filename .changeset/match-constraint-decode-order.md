---
"@real-router/core": patch
---

Fix route constraints being validated against the raw (pre-decode) URL segment (#857)

`SegmentMatcher.match()` checked a route's constraint regex on the raw path segment
before percent-decoding it, but returned (and constrained `buildPath` on) the decoded
value — so the constraint described a different string than the one delivered.

Constraints are now validated **after** decoding, on the value the consumer receives:

- `/users/%35` (decodes to `5`) now matches `/:id<\d+>` instead of resolving to
  UNKNOWN_ROUTE — a legitimately over-encoded value is no longer wrongly rejected.
- A raw form that satisfied the regex but decoded to a value that did not (`/%41`
  under `/:n<.{3}>` → `"A"`) is now rejected instead of being returned (violating the
  route's own constraint) and crashing `start()` via `rewritePathOnMatch → buildPath`.

`build → match` round-trips are unaffected (`buildPath` already emits canonical
values). Found in the 2026-06-18 path-matcher architecture review.
