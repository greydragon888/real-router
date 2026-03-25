---
"@real-router/types": minor
---

`usePlugin()` accepts `false | null | undefined` in type signature (#341)

The `Router.usePlugin()` type signature now accepts falsy values alongside `PluginFactory`, enabling `isDev && plugin()` patterns.
