---
"@real-router/core": patch
---

Reject a name-less route marker (bare `:` or `*`) at registration (#858)

A marker with no name — `/files/*`, `/users/:`, or one carrying only a modifier
(`:?`, `:<\d+>`) — compiled to a phantom empty-named slot: `match()` captured the
value under an empty key (`{ "": "x" }`) while `buildPath()` emitted a literal
`:`/`*` and `buildParamMeta` reported no param at all — a three-way match/build/meta
desync of the same class as #736/#738. `createRouter` now throws a descriptive
`[SegmentMatcher.registerTree] Empty parameter name …` at registration for both
markers, at every child-creation site (param branch, optional fork, splat).
