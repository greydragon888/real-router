---
"@real-router/core": patch
---

Thirty more refusals build through the raiser (#2487)

Internal refactor across fourteen core files: the refusals thrown as
`new TypeError` / `new Error` / `new ReferenceError` / `new RangeError` with a
bracketed literal now write their head once as a binding. No message text moves —
measured by comparing the rendered set against `origin/master`, not assumed.
