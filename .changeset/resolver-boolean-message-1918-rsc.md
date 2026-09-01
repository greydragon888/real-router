---
"@real-router/rsc-server-plugin": patch
---

A resolver returning a boolean is refused with a message that says why (#1918)

This package shares `resolveMode`, so the same asymmetry applied: `ssr: false`
worked and `ssr: () => false` threw with a list of allowed strings that never
mentioned the static slot. The refusal is unchanged — it is what
`SsrModeResolver` contracts — and the message now names the resolver, the value,
and the shorthand to write instead.
