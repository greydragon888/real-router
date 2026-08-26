---
"@real-router/navigation-plugin": patch
---

Keep an escaped reserved character intact across a page reload (#1920)

`safelyEncodePath` was `encodeURI(decodeURI(path))`, and those two are not
inverses over the escapes of reserved characters: `decodeURI` preserves them by
design, and `encodeURI` then escaped the surviving `%`. The plugin composes it in
`navigation-browser.ts` on the same reload path as the other two URL plugins, so
a param carrying `/`, `?`, `#` or `&` came back with its escape doubled.

The function now escapes what is not escaped yet and leaves alone what already
is. Its totality is unchanged — `encodeURI` still throws on a lone surrogate, and
that is still caught.
