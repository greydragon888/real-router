---
"@real-router/browser-plugin": minor
---

Simplify `start()` override for required path in core (#90)

- Add `start(path?: string)` overload via module augmentation, so TypeScript allows `router.start()` without arguments when browser-plugin is installed.
- Remove `StartRouterArguments` type export (**breaking**).
- The `start()` override now always provides browser location to core when no path is given.

**Behavioral change:** When browser is at `/` and `router.start()` is called without arguments, the plugin now passes `"/"` to core (previously fell through to `defaultRoute` resolution). If your `defaultRoute` points to a route with a path other than `/`, you may need to add a route for `/` or call `router.start()` then `router.navigateToDefault()` explicitly.
