---
"@real-router/core": patch
---

Harden `matchPath`: a throw from the post-match path rewrite no longer escapes as a crash (#1157)

`matchPath` rebuilds `state.path` after a successful match (`rewritePathOnMatch`, on by default) via `buildPath` → the query codec. A throw there — e.g. a custom `encodeParams` handing the codec an unserialisable value — propagated as a raw `TypeError` out of `matchPath`, crashing `router.start()` / `navigate()` on a forgeable URL (the concrete #1155 trigger; this is the defense-in-depth companion).

Fix: the rewrite is wrapped so a throw keeps the source path un-rewritten — the match already succeeded (route found, params decoded), only the cosmetic re-canonicalisation failed, so a valid match is preserved instead of discarded. This is the opposite policy to the parse side (#737, "match() must never throw → treat URL as unmatched"): there a throw means the URL can't be understood; here it was understood and matched. A `decodeParams` throw (which runs while producing the state, before the match is finalized) still propagates, unchanged.
