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

Two classes move, not one. The old pair also normalised an escape whose literal
form needs none — `/files/%41` came back as `/files/A` — and that no longer
happens: an escape is left alone whatever it encodes. Harmless, and measured so:
the matcher decodes both forms to the same param, and `buildPath` never emits
such an escape, so it is only reachable from a hand-typed URL, whose address bar
now keeps what was typed.
