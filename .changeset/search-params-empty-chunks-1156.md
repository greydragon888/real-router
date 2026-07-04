---
"@real-router/core": patch
---

Fix `search-params` `parse` injecting a junk `""` param from empty query chunks (#1156)

An empty chunk — a `&&`, a leading `&`, or a trailing `&` — was parsed as an empty name with a missing value, injecting `{ "": null }` (and `[null, …]` on repeats): `parse("&a=1")` → `{ "": null, a: "1" }`, `parse("x=1&&&x=2")` → `{ "": [null, null], x: [1, 2] }`.

Fix: empty chunks (a zero-length span) are skipped in `parseIntoInternal`. An intentional empty-key chunk still carries an `=` (`parse("=1")` → `{ "": "1" }`), so its span is non-empty and it is unaffected.
