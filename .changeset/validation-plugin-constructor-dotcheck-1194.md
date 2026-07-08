---
"@real-router/validation-plugin": patch
---

fix(validation-plugin): reject flat dotted route names on the constructor's initial routes (#1194)

`add()`/`replace()` already reject a dotted route name (e.g. `{ name: "users.view" }`), but the plugin's retrospective pass (`validateExistingRoutes`, run on `usePlugin(validationPlugin())`) validated only name-is-string / path / duplicates — not the dot rule. So a validation-enabled app that declared a dotted name in `createRouter([...])` still slipped it past validation into a name-vs-URL split-brain (buildPath/matchPath disagree; the route mounts at the wrong URL). The retrospective pass now rejects a dotted `name` on the initial routes too, symmetric with `add()`/`replace()` — use a nested `children` array or the `{ parent }` option instead.
