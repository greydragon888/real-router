---
"@real-router/core": minor
---

`addInterceptor` refuses what core cannot run (#2088)

The door keyed its map by whatever string it was handed, so a typo —
`"forwadState"`, `"buildpath"` — registered cleanly, never fired, and returned a
working `Unsubscribe`. Nothing reported it: no throw, no warn, a green suite, and
an application shipping URLs and states the plugin was written to change. That is
criterion (a) for an always-on guard. One argument over sat criterion (b): a
non-function interceptor was admitted here and thrown from whichever navigation
reached the seam first. Both live on one call, so the guard takes both.

```ts
api.addInterceptor("forwadState", fn);
// TypeError: [router.addInterceptor] Invalid method: "forwadState".
//            Must be one of: start, buildPath, forwardState
api.addInterceptor("buildPath", notAFunction);
// TypeError: [router.addInterceptor] interceptor must be a function, got string
```

**One registry, and it is the one that WRAPS.** Membership is asked of `SEAM`
(`src/internals.ts`) — the object the three `create*Interceptable` call sites take
their own names from, so a literal at a call site cannot drift from the set that
decides. `satisfies { [K in keyof InterceptableMethodMap]: K }` ties the runtime
half to the compile-time half in both directions: a seam added to the map fails
the object to compile, an extra key fails, and a value drifting from its key is an
error rather than a silent alias.

⚠ Nothing coerces the name. `Object.hasOwn` performs `ToPropertyKey`, so a
`typeof` test precedes it — otherwise an object whose `toString` returns
`"buildPath"` would be admitted as that seam — and the message renders a
non-string by its type instead of through `String()`, which would run the same
`toString` one line later.

**The same door family, one function over.** `addEventListener` checked its event
name against an always-on guard and left its callback to the opt-in validator, so
bare core stored a non-function and logged `cb is not a function` on every emit of
that event for the life of the router. It now refuses the callback at
registration, with the wording the plugin already publishes — that door keeps its
mirror, and `bare-core-message-parity.test.ts` pins the pair.

**Breaking, deliberately.** A registration that was documented as a silent no-op
now throws. `RouterValidator` also loses `validateAddInterceptorArgs`: core owns
the set at runtime, so a mirror of it is the unpinned copy this change removes.
Anyone implementing that interface drops the member.
