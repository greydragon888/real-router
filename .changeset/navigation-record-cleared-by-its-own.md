---
"@real-router/navigation-plugin": patch
---

A navigation that arrives no longer drops the record of a newer one (same class as #2796)

A navigation the browser starts right after another lands — from a `router.subscribe` listener through a microtask, before the plugin's handler for the first one resumes — keeps the record the plugin took for it. A navigation the router refuses after that now returns to the entry the router stands on. Before, the first navigation's arrival dropped the newer one's record, and the refusal took the browser to the newer navigation's entry, which the router never reached.
