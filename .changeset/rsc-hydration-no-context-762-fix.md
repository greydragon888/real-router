---
"@real-router/rsc-server-plugin": patch
---

Handle a hydration source without a `context` field without crashing (#762)

`rsc-server-plugin` shares the SSR loader factory with `ssr-data-plugin`. A partial hydration source object (`{ name, path }` with no `context`) previously crashed `start()` with a bare `TypeError: Cannot use 'in' operator to search for 'rsc' in undefined`. The factory now guards `hydrationState.context !== undefined` before the namespace lookup, so a missing context falls through to the loader. No API change.
