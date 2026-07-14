---
"@real-router/svelte": patch
---

Fix `Lazy`: a synchronously-throwing loader now renders the error UI instead of escaping (#1476)

`<Lazy>` invoked `loader()` outside any try, so its `.catch` — which only covers the returned promise — missed a loader that throws **synchronously** (init work before the dynamic import, before the promise is returned). The sync throw escaped the `$effect` to `<svelte:boundary>` / uncaught, bypassing the component's own `{status: "error"}` UI. `loader()` is now wrapped in a `try/catch` that routes a sync throw into the same rejection path as an async failure, so both surface consistently in the error UI. The loader is still invoked synchronously on mount; the async path is unchanged.
