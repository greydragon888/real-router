---
"@real-router/core": minor
---

`PluginApi.addCheck` — a refusal-only channel at named positions (#2388)

A plugin may now register a check at a named position inside a door:

```ts
getPluginApi(router).addCheck("buildPath:params", (ownParams) => {
  if (ownParams?.id === "") throw new TypeError("empty id");
});
```

A check may **throw and do nothing else** — it cannot replace an argument or skip
the call. That is what separates it from `addInterceptor`, and the split is
measured rather than stylistic: no shipped interceptor outside core refuses, and
no validator refusal replaces an argument.

- `CheckPositionMap` declares each position and the argument tuple it hands over;
  `CheckFn<P>` is typed from it. Both ship on `@real-router/core/types`.
- `POSITION` is the runtime half, tied to the map by
  `as const satisfies { [K in keyof CheckPositionMap]: K }` — a position in one
  and not the other fails to compile, in both directions.
- `addCheck` refuses an unknown position and a non-function, wording and
  non-coercion mirrored from `addInterceptor`.
- `RouterInternals.checks` holds the registrations and `dispose()` clears it.

**Two positions ship, both mid-body: `buildPath:params` and
`buildPathResolved:params`.** Each is handed `ownParams` — the copy that printer
prints the path from (#2134) — which is the case an interceptor cannot express,
because at the call boundary that object does not exist yet. Core no longer
consults `validator.navigation.validateParams` at either printer;
`@real-router/validation-plugin` registers both walks as checks. Behaviour and
messages are unchanged, and `navigate` / `canNavigateTo` still consult the
validator.

The two printers hold SEPARATE positions rather than sharing one: they are
reached independently — the href door runs the forward chain itself and lands on
the resolved one — and each refusal names the door the caller actually called.

`buildPath`'s ENTRY is deliberately NOT a position: the consultation standing
there mixes a refusal with a diagnostic, and a diagnostic is not this channel's
to carry.
