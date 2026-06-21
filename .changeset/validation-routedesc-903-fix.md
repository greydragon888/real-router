---
"@real-router/validation-plugin": patch
---

Keep `[method]` context in route-validation messages for adversarial input (#903)

`validateRoute` (from `route-tree`, used by the plugin's route validators) built its `TypeError` messages through a `getTypeDescription` helper that crashed on a value with an adversarial own `constructor` — e.g. `addRoute({ name: { constructor: null }, path: "/x" })` threw `Cannot read properties of null (reading 'name')` instead of `[router.addRoute] Route name must be a string`. The helper now reads `constructor` defensively, so the contextual validation error is preserved. (Sibling of #787, which fixed the same defect in `type-guards`.)
