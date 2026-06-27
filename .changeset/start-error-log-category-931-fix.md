---
"@real-router/core": patch
---

Log `start()` failures under the `router.start` category, not `router.navigate` (#931)

A `start()` rejection that is not a suppressed `RouterError` — a start interceptor that throws after `next()` committed (the SSR/RSC loader window), or a cryptic path `TypeError` — was logged by the fire-and-forget safety net under the `router.navigate` category, so operators filtering production logs for start failures missed them. The suppressor is now split per call-site: `navigate` / `navigateToDefault` / `navigateToState` log under `router.navigate`, `start()` under `router.start`.

Also removed false `Stryker disable … unreachable` comments on the suppressor log lines. Both are reachable — a `subscribeLeave` listener throw or a Symbol path-param `TypeError` reaches the navigate line, an interceptor throw reaches the start line — and are now covered by killing tests asserting the log category.
