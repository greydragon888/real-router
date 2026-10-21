---
"@real-router/browser-plugin": patch
---

Two overlapping Backs keep every entry's page (same class as #2796)

When a guard holds a Back and a second Back arrives behind it, the first one's transition no longer writes its route over the entry the second Back took the browser to. The browser and the router then agree on where the router stands, and every entry keeps its page whichever order the two settle in. Before, the first Back's success rewrote that entry with its own URL: the page the second Back was for vanished from history.

- Where the plugin cannot measure where the browser stands — an entry without the plugin's position, a custom `Browser` without `getState` — it writes as before.
