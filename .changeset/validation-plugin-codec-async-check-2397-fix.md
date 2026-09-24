---
"@real-router/validation-plugin": patch
---

The async check no longer throws on a codec that is not a function (#2397)

`add` and `replace` asked whether `decodeParams` / `encodeParams` was async
before asking whether it was a function, and read its `constructor` to find out.
A codec with no `constructor` — `Object.create(null)` — made that read throw
`TypeError: Cannot read properties of undefined (reading 'name')`, naming neither
the route nor the field. The async check now reads only a function, so such a
codec reaches the plugin's own refusal: `[router.addRoute] Route "<name>"
decodeParams must be a function`.
