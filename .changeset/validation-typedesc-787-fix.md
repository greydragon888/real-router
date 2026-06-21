---
"@real-router/validation-plugin": patch
---

Keep `[method]` context in validation messages for adversarial input (#787)

`getTypeDescription` (used to build the plugin's `TypeError` messages) crashed on a value with an adversarial own `constructor` — `{ constructor: null }` threw `Cannot read properties of null (reading 'name')` — and returned a non-string for `{ constructor: "evil" }`. Validating such input now yields the proper `[method] Invalid … structure` message instead of a bare, context-less `TypeError`.
