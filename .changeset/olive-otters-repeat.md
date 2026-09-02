---
"@real-router/ssr-utils": patch
---

`serializeRouterState` reads the caller's `state.context` once ([#2085](https://github.com/greydragon888/real-router/issues/2085))

The door takes a `State`, so the slot may be an application's own accessor and
every read of it is a call into that code. It was read twice on the
`excludeContext` path — and the first answer was discarded a line later, so the
extra call bought nothing.
