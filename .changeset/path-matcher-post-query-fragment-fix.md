---
"@real-router/core": patch
---

Strip a URL fragment that appears after a query string (#842)

`SegmentMatcher.match()` did not strip a fragment (`#…`) when it followed a
query string: the single-pass scanner returns at the first `?`, so a later `#`
was folded into the query string and parsed into a param value — e.g.
`/users/v?ref=1#section` captured `ref: "1#section"` instead of `ref: "1"`,
corrupting both declared and undeclared query params (reachable via
`router.start(url)`). This violated the documented hash-stripping contract
(INVARIANTS Path Rejection #3).

`#preparePath` now strips the fragment from the query substring with a native
`indexOf("#")` (only when a query exists, ~free), so a fragment is removed
before query parsing regardless of whether it follows the path or a query.
The hash-stripping property test previously only built query-less paths, so the
bug survived the whole suite; a `path?query#fragment` property + unit tests were
added.
