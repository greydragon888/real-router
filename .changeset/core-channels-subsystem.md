---
"@real-router/core": patch
---

Channel correctness becomes a subsystem, not a corner of `helpers.ts`

The rule "`params` is the path channel, `search` the query channel, and the
router moves nothing between them" was enforced from two files both named
`helpers.ts` — the bag check in `src/helpers.ts`, the config check in
`namespaces/RoutesNamespace/helpers.ts`. That split is how #1584's existence
precondition came to land on one half and not the other. Both halves now live in
`src/channels/`: `guard` (the predicate, the assert, the message), `defaults`
(the registration-time check and the caller-beats-default precedence rule) and
`modeGate`.

A subsystem rather than a namespace method because the rule has no owning
module. The other four always-on guards each do — `subscribe` belongs to
`EventBusNamespace`, `start(path)` to `RouterLifecycleNamespace`,
`navigateToNotFound` to the facade, `claimContextNamespace` to `getPluginApi` —
while this one runs from the facade, from `internals`, from the `forwardState`
seam, from the `decodeParams` boundary, from `updateRoute` and from four
registration entry points. A cross-cutting invariant with five callers in four
modules is a subsystem; a file named "helpers" is what let it drift.

`src/channels/` imports nothing from the namespaces, the engine or the pipeline —
the same inversion `src/pipeline` makes with its `RouteResolver` port. Declared
query names arrive as DATA (`readonly string[]`, or a `queryNamesOf` accessor),
never as a matcher, so a second derivation of the one registry that both
classifies and prints (#1556) cannot grow inside it. The config check took the
matcher before; it now takes the accessor, and
`RoutesNamespace/helpers.assertRouteDefaultChannelsFor` is the five-line adapter
that supplies it — with the caches local to the attempt, which is what the four
entry points need, since each validates PREPARED artifacts before any swap. The
boundary is enforced by `no-restricted-imports`, verified to fail on a
deliberately added `../engine` import.

No behaviour change. `src/helpers.ts` drops 580 -> 318 lines and is now merge,
comparison and state-freeze semantics only.
