---
"@real-router/svelte": minor
---

Adapt to the RFC-4 M2 params/search slot-shift (#1548)

The `link` action and the shared `navigateWithHash` / scroll-spy DOM helpers pass
the query channel at navigate position 3 and options at position 4, matching core's
new `navigate(name, params, search, opts)` signature.
