---
"@real-router/solid": patch
---

Announce the first navigation after `<RouterProvider announceNavigation>` mounts (#2796)

The announcer leaves out the initial page load — the commit of `router.start()` on a router that had committed nothing when the announcer was created. It skipped the first navigation it observed instead, so in the canonical order, `await router.start()` and then render, the first navigation after mount was never announced. A `start()` after `stop()` on a router that had committed by then changes the page without a load, and is still announced. The same class of defect as #2796.
