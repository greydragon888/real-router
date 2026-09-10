---
"@real-router/preact": patch
---

Three pieces of DOM-utility state now carry identity

Each was state that outlives the thing it describes and is then read as if it
still described it. The directory already carried the idea twice —
`view-transitions.ts` has `scheduledVT` (#781) and `scroll-restore.ts` has
`scrollSettled` on the capture side (#782); these are the places it was missing.

**A stale scroll-restore loop could overwrite the current page.** The retry
budget that resolves a late-mounting container was gated by `destroy()` alone,
so nothing told loop _N_ that navigation _N+1_ had happened. With an unreachable
target — a container that clamps short and keeps retrying — two loops ran
concurrently and the older one wrote last: the moment the first container's
layout grew, the PREVIOUS route's offset landed on the current page, permanently.
With `behavior: "smooth"` the target-reached exit is disabled by design, so any
two navigations within ten frames were a tug-of-war. Each restore now captures a
token and retires when a newer one starts.

**A second adapter bundle could remove the first's announcer element.** The
ref-count and generation were module-scoped while the element they protect is
found with `document.querySelector` — and a page running two adapter bundles,
the micro-frontend case the ref-count exists for, does not share module scope.
The second bundle took the `existing` branch, read its own generation (still 0,
because only the create branch bumps it), passed the ownership guard, decremented
its own count to zero and removed the live element: a silent screen reader for
every sibling provider. Both counters now live on the DOM, which is the scope the
element itself has.

**A popstate with no transition mislabelled the next navigation.**
`createDirectionTracker`'s flag was armed by any `popstate` on `globalThis` and
cleared only by a `subscribeLeave`, so one the router never consumed —
`history.back()` onto an entry resolving to the current state, or an entry pushed
by a modal, a lightbox or an analytics shim — left it armed indefinitely and
published `<html data-nav-direction="back">` on the next FORWARD navigation. The
flag is now spent by the transition it belongs to, whether or not that transition
reaches a leave phase: the tracker observes `TRANSITION_START` /
`_SUCCESS` / `_ERROR` / `_CANCEL` through `getPluginApi`, the same door
`@real-router/sources` uses, and a popstate arriving mid-transition is held for
the replay the URL plugin defers it into.

⚠ **`createDirectionTracker` now requires a live `Router`** — it resolves the
instance in core's internals registry. A `subscribeLeave`-shaped stand-in throws
`Invalid router instance`. The utility is documented `unstable`, and no
adapter's provider wires it; only direct callers are affected.

Closes #1924.
