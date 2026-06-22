---
"@real-router/validation-plugin": patch
---

Implement duplicate-plugin detection (#726)

`validateNoDuplicatePlugins` was an inert no-op, so re-registering the same plugin factory under the validation plugin (`usePlugin(f); usePlugin(f)` without `unsubscribe()` in between) was silently accepted — registering double interceptors. It now throws `[router.usePlugin] Plugin factory already registered.`.

Plugins that claim a context namespace (e.g. `persistent-params`) already failed on double-init via core's `claimContextNamespace` collision guard; this closes the gap for plugins that **don't** claim a namespace, where core had no backstop. The check only runs when `@real-router/validation-plugin` is registered; distinct factories are unaffected.
