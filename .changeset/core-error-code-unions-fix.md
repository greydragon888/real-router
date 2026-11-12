---
"@real-router/core": minor
---

Derive `ErrorCodeKeys` and `ErrorCodeValues` from `ErrorCodeToValueMap`, so they cover every code in `errorCodes` (#2363)

`ErrorCodeKeys` lacked `WRONG_CHANNEL`, and `ErrorCodeValues` lacked
`NOT_STOPPED`, `REENTRANT_NAVIGATION`, `REENTRANT_TREE_MUTATION` and
`WRONG_CHANNEL`. So `errorCodes` was not assignable to the exported `ErrorCodes`
type, and `const code: ErrorCodeValues = errorCodes.WRONG_CHANNEL` did not
compile. Both unions are now the keys and the values of `ErrorCodeToValueMap`.

**Breaking Change:** a `Record` keyed by either union, or an exhaustive `switch`
over one, now has to cover the codes above.
