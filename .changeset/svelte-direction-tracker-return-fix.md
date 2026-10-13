---
"@real-router/svelte": patch
---

`createDirectionTracker` keeps the navigation after a refused Back or Forward labelled `forward` (#2740)

The URL plugins take the browser back to the entry a refused Back or Forward started from, and that return fires a `popstate` that no transition follows. The tracker armed its flag on it and published `<html data-nav-direction="back">` on the next forward navigation. A `popstate` that lands on the URL of the router's current state — built with the URL plugin's `buildUrl` — no longer arms it. Without a URL plugin, or when `buildUrl` throws, every `popstate` arms it, as before.
