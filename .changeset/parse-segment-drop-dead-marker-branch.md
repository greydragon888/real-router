---
"@real-router/core": patch
---

Drop an unreachable `?`-after-marker branch in the parse-segment tokenizer (#1324)

`parseSegment` no longer special-cases a `?` immediately following a bare marker
inside a static segment (`a:?`). That shape never reaches the tokenizer through a
real route path — a `?` after a bare marker is not a valid `:name?` optional, so the
query mask strips it before `/`-segmentation — so the arm was unreachable dead code,
surfaced by migrating the path-matcher unit tests to exercise the public API.
Behaviour is unchanged on every real route: the `parseSegment ≡ parsers` equivalence
property and the route-tree gate↔backstop parity both still hold. Only a direct
`findSegmentGrammarError("/a:?b")` call — which no consumer makes — now reports
`fused-marker` instead of `undefined`.
