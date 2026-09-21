---
"@real-router/core": patch
---

Every refusal a caller can reach names a door (#2459)

`message-prefix-authority-1845` registered thirteen refusals that carried no prefix at all (#2456) without judging them — a row said a message had none, not that it should have none. Each was driven through the doors that print it, and the register is now empty.

**Twelve are reachable from caller input and open with the bare `[router]`**, the form #1845 settles a raiser serving several doors with:

```diff
-dependencies must be a plain object
+[router] dependencies must be a plain object
```

| message | doors that print it, measured |
| --- | --- |
| `dependencies must be a plain object` · `dependencies cannot contain getters` | `createRouter(…, deps)`, `getDependenciesApi().setAll`, `cloneRouter(router, deps)` |
| the five logger-config refusals | `createRouter(…, { logger })`, `cloneRouter(…, …, { logger })` |
| `route must be a non-array object` | `createRouter([…])`, `getRoutesApi().add` |
| the two `forwardTo` refusals | `createRouter([…])`, `getRoutesApi().add` |
| `Duplicate listener` | `PluginApi.addEventListener` |
| `Listener limit` | `PluginApi.addEventListener`, `router.subscribe` |

**The thirteenth is not reachable, and that is measured rather than assumed.** `EventEmitter.on` has four call sites: `subscribeChanges`, `subscribeDiagnostic` and `subscribe` each hand it a closure core wrote, and `addEventListener` — the one that forwards the caller's value — passes `assertListenerIsFunction` first, which already refuses with `[router.addEventListener]`. `EventEmitter` is on no exports map and not in `src/index.ts`. So `Expected callback to be a function for event …` answers a caller inside this package, takes `[EventEmitter]`, and is registered in `CORE_INTERNAL` — the statement #1845 asks for, not an exemption.

⚠ **These strings are observable.** Anything matching them by exact equality has to move; everything in this repository that did is updated, and `@real-router/validation-plugin`'s messages are untouched.
