---
"@real-router/core": patch
---

Fix `buildPath` emitting `//…` when a leading optional param is omitted (#1147)

For a route whose FIRST segment is an optional param (`/:lang?/home` — the optional-locale-prefix pattern), omitting it made `#buildUrlPath` produce `//home`: the trailing-slash trim only fired for `result.length > 1`, so the lone leading `/` was never trimmed before appending the next `/`-prefixed part. That URL is one the matcher itself rejects (double slash), and `rewritePathOnMatch` then wrote the unmatchable `//home` into `state.path`, silently replacing a valid input URL with an invalid one.

Fix: at an optional-omit point the leading-slash case (`result === "/"`) now drops the lone slash when the next part starts with `/`, so exactly one separator is emitted (`/home`). Mid/trailing optional omits (`/a/:b?/c` → `/a/c`, `/home/:x?` → `/home`) and a route that is only a leading optional (`/:lang?` → `/`) are unchanged.
