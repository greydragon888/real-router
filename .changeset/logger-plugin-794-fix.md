---
"@real-router/logger-plugin": patch
---

Gate the `"Router transition"` console group on the transition log level (#794)

`onTransitionStart` opened a `console.group` unconditionally, so at `level: "none"` (and `"errors"`) the plugin still emitted an empty, expandable group on every transition — a `console.group` is itself console output, breaking the "completely silent" guarantee of INVARIANTS Completeness Inv 3. The group is now opened only when `#logTransition` is set (i.e. it will actually be populated); the idempotent close path is unchanged. The Inv 3 / Level-Filtering property assertions were extended to also verify no `console.group`/`console.groupEnd` calls at `level: "none"`/`"errors"`.
