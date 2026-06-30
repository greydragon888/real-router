---
"@real-router/validation-plugin": patch
---

Never-crash on an adversarial throwing accessor in route/param validation (#1052)

`getTypeDescription` and `isParams`/`isParamsStrict` read `constructor`/`.name`/property values without a `try/catch`, so an adversarial **throwing accessor** — a `constructor`/`.name` getter that throws, or a `Proxy` that throws on `[[Get]]` — made them throw the caller's exception instead of returning their documented fallback, breaking the #787/#903/#786 never-crash contract. These paths are reachable only through `@real-router/validation-plugin` (route-tree's `validateRoute` and the type-guards guards run in the plugin's always-on validators). The reads are now wrapped in `try/catch` (returning `"object"` / `false` — the same fallback as the non-function-value branch) in both `getTypeDescription` copies (type-guards + route-tree's twin) and the `isParams`/`isParamsStrict` walks, so the plugin surfaces a clean `[router.addRoute] … must be …` `TypeError` instead of leaking the getter's exception. Not reachable from untrusted input (URL params are strings; `history.state` is structured-clone and cannot carry getters/Proxies).
