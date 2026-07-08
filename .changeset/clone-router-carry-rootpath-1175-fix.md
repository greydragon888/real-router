---
"@real-router/core": patch
---

fix(core): cloneRouter carries the source rootPath (#1175)

`rootPath` lives in the routes store (not options/config), and neither `routeTreeToDefinitions` nor `getCloneState()` include it — so `cloneRouter` constructed every clone with `rootPath = ""`. A base configured via `setRootPath("/app")` matched `/app/...`, while its clones silently built and matched `/...`, resolving every `/app/...` URL to `UNKNOWN_ROUTE`. In SSR (one clone per request), a sub-path deployment 404'd on every request.

cloneRouter now carries `sourceStore.rootPath` onto the clone (when non-empty) right after the config copy, so the clone's tree rebuilds under the same sub-path. The rebuild is only paid when a rootPath is actually set.
