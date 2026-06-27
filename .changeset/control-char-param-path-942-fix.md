---
"@real-router/validation-plugin": patch
---

Reject NUL / control characters in param values and start paths (#942)

A NUL byte or C0/DEL control character in a param value or a `start()` path is silently percent-encoded into `state.path` (`%00`, `%01`) by bare core, admitting unreadable paths into committed state. The opt-in validator now rejects them: `validateParams` flags a control character inside a string param value, and `validateStartArgs` flags one in the start path — both with an actionable `TypeError`.
