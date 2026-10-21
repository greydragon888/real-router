---
"@real-router/angular": patch
---

Announce the first navigation after `<navigation-announcer>` is created (#2796)

The announcer leaves out the initial page load — the commit of `router.start()`, the one with no previous route. It skipped the first navigation it observed instead, so with the router started before bootstrap or in an app initializer, the first navigation after `NavigationAnnouncer` was created was never announced. The same class of defect as #2796.
