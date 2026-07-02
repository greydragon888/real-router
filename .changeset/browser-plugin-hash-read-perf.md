---
"@real-router/browser-plugin": patch
---

Cache the URL fragment instead of reading `location.hash` on every navigation (#1019)

`onTransitionSuccess` read `location.hash` (`getDecodedHash`) on every navigation to preserve the current fragment (#532). Reading a `location.*` property in a navigation stream forces the browser to synchronously commit the pending `pushState`, costing ~0.04 ms/nav (~25% of a Vue per-navigation, and ~38% of the plugin's per-nav share, in the cross-router benchmark — see `benchmarks/cross-router/VUE_NAV_DECOMPOSITION.md`). The plugin now caches the fragment — seeded once on start, updated by its own navigations and by a `hashchange` listener for external changes (anchor clicks, manual `location.hash =`) — so the per-navigation hot path never reads `location.hash`. Framework-agnostic: the plugin is shared by every adapter cohort. Hash semantics (#532) are unchanged — external fragment changes are still observed (now via `hashchange`), and the popstate path still samples `location.hash` (a rare event, not the hot path).
