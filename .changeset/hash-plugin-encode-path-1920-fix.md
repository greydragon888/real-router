---
"@real-router/hash-plugin": patch
---

Keep an escaped reserved character intact in the hash path (#1920)

`safelyEncodePath` was `encodeURI(decodeURI(path))`, and those two are not
inverses over the escapes of reserved characters: `decodeURI` preserves them by
design, and `encodeURI` then escaped the surviving `%`. The hash channel reaches
it through `buildHashLocation`, so `#/files/a%2Fb` became `/files/a%252Fb` and a
param the application had stored as `a/b` came back as `a%2Fb`.

The function now escapes what is not escaped yet and leaves alone what already
is. A percent that begins nothing interpretable is still carried where it stands
— same result as before, now without a `URIError` behind it.
