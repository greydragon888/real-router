---
"@real-router/types": patch
---

Add the `NavigationOptions.revalidate` marker (#1201)

Core sets `revalidate: true` on the `TRANSITION_SUCCESS` that `getRoutesApi(router).replace(...)` emits when it revalidates the active state (#950), so a plugin's `onTransitionSuccess(toState, fromState, opts)` can distinguish a `replace()` revalidation from a real navigation — both otherwise carry only `replace: true`. It is a core-set observability signal, not a user-facing navigation option.
