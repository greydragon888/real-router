---
"@real-router/hash-plugin": patch
---

fix(hash-plugin): warn+ignore `{ hash }` in `replaceHistoryState` instead of splicing a fragment (#1230)

`replaceHistoryState(name, params, { hash: "x" })` spliced the fragment into the hash-route URL (`#!/about#x`) with no warning — unlike `buildUrl`/`navigate`, which warn once and ignore it (`#` is the route delimiter, so URL fragments are structurally unsupported). The shared `createReplaceHistoryState`'s explicit-hash branch runs independently of the `preserveHash` flag, so hash-plugin's `preserveHash=false` did not suppress it. hash-plugin now wraps the extension: it emits the same one-time warn and drops `{ hash }` before delegating, completing the warn+ignore contract across all three hash-accepting methods. browser-plugin / navigation-plugin (which legitimately support tri-state `{ hash }`) are unaffected.
