---
"@real-router/vue": patch
---

Fix per-Match `keepAlive` when used as template boolean shorthand

Template usage like `<RouteView.Match segment="dashboard" keepAlive>` was not
preserving state across navigation. Vue compiles boolean-shorthand attributes
to an empty string and only promotes them to `true` when the receiving prop is
declared with `type: Boolean`. `Match` is a render-null marker — its props are
inspected directly on the VNode without going through the cast pipeline, so
the raw `""` reached `RouteView` and failed the strict `=== true` check,
causing the component to fall through to the non-keepAlive render path.

`detectPerMatchKA` and `renderWithPerMatchKA` now accept the three values Vue's
own runtime treats as `true` for Boolean props: `true`, `""`, and the
hyphenated attribute name. Programmatic `h(RouteView.Match, { keepAlive: true })`
continues to work unchanged.
