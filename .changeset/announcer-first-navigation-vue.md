---
"@real-router/vue": patch
---

Announce the first navigation after `RouterProvider` with `announceNavigation` mounts, or after the prop is switched on (#2796)

The announcer leaves out the initial page load — the commit of `router.start()` on a router that had committed nothing when the announcer was created. It skipped the first navigation it observed instead, so in the canonical order, `await router.start()` and then mount, the first navigation after mount was never announced, and neither was the first one after `announceNavigation` turned on. A `start()` after `stop()` on a router that had committed by then changes the page without a load, and is still announced. The same class of defect as #2796.
