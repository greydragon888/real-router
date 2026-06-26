---
"@real-router/core": patch
---

Cache the boolean-shorthand guard factories (#962)

- `booleanToFactory` allocated a fresh factory + closure on every boolean-shorthand guard registration (`addActivateGuard(name, true | false)` or route-config `canActivate: true`). Since the shorthand has only two values, both now reuse one of two module-level cached factories. No behavior change — guards still resolve to the same boolean.
