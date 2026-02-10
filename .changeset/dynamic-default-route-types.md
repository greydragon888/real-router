---
"@real-router/types": minor
---

Add `DefaultRouteCallback` and `DefaultParamsCallback` types (#39)

New callback type aliases for dynamic `defaultRoute` and `defaultParams` options. `Options.defaultRoute` is now `string | DefaultRouteCallback`, `Options.defaultParams` is now `Params | DefaultParamsCallback`.
