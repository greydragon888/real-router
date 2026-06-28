---
"@real-router/logger-plugin": patch
---

Clear the plugin's own Performance API marks/measures by name so the User Timing buffer stays bounded (#795)

With `usePerformanceMarks: true`, the plugin created ~3 marks + 1 measure per transition (`transition-start`, the standalone `leave-approved`, the terminal `transition-end`/`-cancel`/`-error`, and the `transition:*` measure) and never cleared them — the User Timing buffer is unbounded per spec, so a long dev session accumulated tens of thousands of entries. The tracker's `measure()` now clears its start/end marks and the measure by name (in a `finally`, so a failed measure still reclaims its inputs), and the standalone `leave-approved` mark — never an endpoint of a measure — is cleared in `#resetTransitionState`. Only the plugin's own names are cleared, so the app's marks/measures are untouched; the trace events already emitted to an in-progress DevTools recording are unaffected.
