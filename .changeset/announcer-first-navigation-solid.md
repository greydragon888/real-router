---
"@real-router/solid": patch
---

Announce the first navigation after `<RouterProvider announceNavigation>` mounts (#2796)

The announcer leaves out the initial page load — the commit of `router.start()`, the one with no previous route. It skipped the first navigation it observed instead, so in the canonical order, `await router.start()` and then render, the first navigation after mount was never announced. The same class of defect as #2796.
