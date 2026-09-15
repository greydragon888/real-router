---
"@real-router/core": minor
---

`PluginApi.getAdoptedOrigins` — the weak origin record reaches plugins without the internals door (#2339)

First slice of retiring the published `getInternals`: the one member that moves
without being redesigned. `getPluginApi(router).getAdoptedOrigins()` answers what
`getInternals(router).getAdoptedOrigins()` answers, and its type is published, so
a consumer can name what it holds.

An ALIAS of the internals member rather than a call, measured: the call form makes
it a distinct pair for the internals parity ledger, which requires a hostile-input
vector per pair — and this member takes no arguments, so that vector could only be
vacuous. Nothing stubs it either, which is the condition the stub-seam authority
attaches to the call form.

⚠ The internals member stays for now. It cannot leave while `getPluginApi` reads
its context from `getInternals`, so the two are a pair until the subpath stops
publishing internals.
