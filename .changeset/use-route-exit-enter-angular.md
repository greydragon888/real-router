---
"@real-router/angular": minor
---

Add `injectRouteExit` and `injectRouteEnter` (#547)

Angular parity with the React adapter (#544, #548). Identical context types and option shapes; idiomatic Angular implementation uses `inject(DestroyRef)` (for the leave subscription) and `effect()` (for the enter watcher). Both must be called within an injection context.

- **`injectRouteExit(handler, options?)`** — wraps `router.subscribeLeave` with reentrant abort pre-check and same-route skip (default `true`). Cleanup is bound to the injection context's `DestroyRef`.
- **`injectRouteEnter(handler, options?)`** — fires `handler` once when the component is created as a result of a navigation. Skip-initial via `route.transition.from`, skip-same-route default. Reads from `injectRoute()` (`{ routeState, navigator }`) inside `effect()`; cleanup wired through the active context's `DestroyRef`.

```ts
@Component({ ... })
class FormComponent {
  constructor() {
    injectRouteExit(async ({ signal }) => {
      await this.api.saveDraft(this.form, { signal });
    });

    injectRouteEnter(({ route, previousRoute }) => {
      analytics.track("page_enter", { route: route.name, from: previousRoute.name });
    });
  }
}
```

**Handler-reactivity caveat:** `inject*` functions run **once** during component construction; the handler is captured at injection time. The common Angular pattern is to pass a class method whose identity is stable across change detection. To vary behavior over time, read signals **inside** the handler body. See `packages/angular/CLAUDE.md` for details.

Types exported: `RouteExitContext`, `RouteExitHandler`, `UseRouteExitOptions`, `RouteEnterContext`, `RouteEnterHandler`, `UseRouteEnterOptions`.
