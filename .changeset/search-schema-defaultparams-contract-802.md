---
"@real-router/search-schema-plugin": patch
---

Document the `defaultParams` runtime contract and sharpen the dev warning (#802)

The plugin's runtime guarantee ("invalid params never reach `state`") is scoped to
user **input**. `defaultParams` are trusted developer config injected by the router
core _below_ the interceptor seam the plugin hooks, so a `defaultParams` value that
violates its own `searchSchema` still reaches `state` and the URL at runtime — in every
`mode`, including `production`. This is now documented as a contract in the README and
wiki, and the dev-time warning states the consequence (the value still reaches state)
plus the fix (make `defaultParams` satisfy `searchSchema`). No behavior change.
