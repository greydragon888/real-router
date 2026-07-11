---
"@real-router/hash-plugin": patch
---

fix(hash-plugin): reset the popstate/hashchange dedup on a macrotask, not a microtask (#1228)

A hash-changing back/forward fires the `popstate`+`hashchange` pair in one browser task, but a **microtask checkpoint runs between the two listeners** (verified in Chromium: `[popstate, microtask, hashchange, macrotask]`). The dedup's `queueMicrotask` reset therefore cleared its guard flags before the pair's second event, which was then handled as an independent navigation to the same location → a phantom `SAME_STATES` `$$error` on **every** hash back/forward (leaking to `$$error` subscribers — error boundaries, reporting, devtools — and doing a redundant `replaceState`). The `saw*` flags now reset on a `setTimeout(0)` macrotask, which fires **after** the pair completes, so the guard spans the whole pair. State, URL, and the type-scoped / order-independent dedup semantics are unchanged.
