---
"@real-router/ssr-data-plugin": patch
---

A resolver returning a boolean is refused with a message that says why (#1918)

`ssr: false` resolves to `"client-only"`; `ssr: () => false` threw
`mode "false" is not allowed for route "p". Allowed: full, data-only,
client-only` — a list that never mentions the slot which does accept the boolean.

⚑ The refusal stays. It is what the published type contracts:
`SsrModeResolver<M> = (state) => M` with `M extends SsrMode`, a string. `boolean`
is a member of `SsrModeConfig` — the STATIC slot — and never of a resolver's
return. Accepting booleans from a resolver would have widened a published type to
match a spelling it never offered; what was actually wrong is the message.

It now names the resolver, the value, and the static shorthand to use instead.

The issue named **two** messages, and the second is the validator's own text for a
malformed `ssr` slot: `must be SsrMode string, boolean, or (state) => SsrMode`.
That spelling is what invites the inference — a reader takes `(state) => SsrMode`
to mean the resolver may return whatever the slot accepts. It now reads `must be
an SsrMode string, a boolean, or a resolver returning an SsrMode string`, which
closes the inference where it starts rather than only where it bites.
