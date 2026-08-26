---
"@real-router/browser-plugin": patch
---

Keep an escaped reserved character intact across a page reload (#1920)

`safelyEncodePath` was `encodeURI(decodeURI(path))`, and those two are not
inverses over the escapes of reserved characters: `decodeURI` preserves them by
design, and `encodeURI` then escaped the surviving `%`. A param carrying `/`,
`?`, `#` or `&` travels as `%2F` / `%3F` / `%23` / `%26` — which `buildPath`
emits — so `start()` with no path, i.e. every page reload, turned it into
`%252F` and handed back `a%2Fb` where the application had stored `a/b`, with the
address bar rewritten to match.

The function now escapes what is not escaped yet and leaves alone what already
is. A path with nothing to escape, a raw non-ASCII path and an already-encoded
`%20` are all unaffected.
