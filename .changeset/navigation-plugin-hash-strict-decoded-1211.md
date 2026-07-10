---
"@real-router/navigation-plugin": patch
---

Strictly-decoded `hash` contract (#1211) — `normalizeHashInput` no longer decodes

The `hash` option (`navigate({ hash })`, `buildUrl({ hash })`, `replaceHistoryState({ hash })`) is a DECODED fragment and is now encoded verbatim. `normalizeHashInput` previously stripped the leading `#` **and decoded** — a second decode that corrupted literal-percent fragments (`"a%20b"` → `"a b"`, redirect URLs / serialized tokens broken) and split the plugin↔adapter policy. It now strips `#` only. `{ hash: "a%20b" }` is the literal fragment `a%20b` → `#a%2520b` (was `#a%20b`). **Breaking** for callers who passed raw, percent-encoded `location.hash` — pass a decoded fragment. Part of the wave-2 hash cluster FORM axis; the framework adapters' `<Link>` encoder is aligned in their patch.
