---
"@real-router/core": patch
---

Match rootPath only at a segment boundary (#740)

With a configured `rootPath`, `SegmentMatcher.match()` stripped the prefix with a
bare `startsWith` and no boundary check, then lost the leading `/` of the
remainder. A path that merely shared the prefix string mis-routed: under root
`/app`, `/apple` matched the route `/e` (the `l` was silently eaten as a phantom
leading slash).

`match()` now accepts a rooted path only when it equals the root or continues it
at a `/` segment boundary, and the stripped remainder always keeps its leading
`/` — for roots declared with or without a trailing slash. Prefix-only paths
(`/apple` under `/app`) now correctly return `undefined`.

Closes the rootPath mis-routing item of the foundation-audit path-matcher cluster (#740).
