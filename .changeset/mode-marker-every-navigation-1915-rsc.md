---
"@real-router/rsc-server-plugin": patch
---

The SSR mode marker is published on every navigation (#1915)

This package shares `shared/ssr/createSsrLoaderPlugin.ts`, so `getSsrRscMode` had
the identical defect: after any client navigation it answered `"full"` for a
route declared `ssr: false`, because only `start()` wrote the marker it reads.

The marker write moved above the staleness gate in the `subscribeLeave` listener,
which already ran on every navigation. `getSsrRscMode` now answers the same for a
route whether it was started or navigated to.
