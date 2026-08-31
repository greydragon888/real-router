---
"@real-router/core": patch
---

Give each route-name rule one owner (#2035)

The name rules — empty, whitespace-only, over-length, dotted, and the ASCII
pattern — now live in `engine/validation/route-name.ts` as one named predicate
each, the name-side counterpart to `validateRoutePath`. `validateRoute`
composes them in the order it applied them inline, and bare-core registration
calls the dotted predicate instead of restating its message, which retires the
one rule core carried twice.

No behaviour change: every message, and the order the rules fire in, is
unchanged.
