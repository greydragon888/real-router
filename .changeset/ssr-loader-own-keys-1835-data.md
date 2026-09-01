---
"@real-router/ssr-data-plugin": patch
---

The SSR loader factory reads caller-supplied bags by own key (#1835)

`shared/ssr/createSsrLoaderPlugin.ts` enumerated the loaders map with
`Object.entries` and then read each entry's fields with a member access, so the
guard and the consumer asked different questions. Measured against the released
factory:

```
Object.prototype.loader = evilFactory
plugin({ profile: { ssr: true } })      // the entry declares NO loader
  →  evilFactory ran, state.context.data === "PWNED"

Object.prototype.ssr = () => "client-only"
plugin({ profile: () => realLoader })   // short form
  →  realLoader ran 0 times, mode silently "client-only"
```

The short form is the sharper of the two: its entry object is a `{ loader: raw }`
literal the factory builds itself, so the inherited `ssr` is read off an object
the caller never supplied. `Object.hasOwn` now gates both fields, in the compiler
and in the validator — the validator read them the same way, which turned ambient
junk into a REFUSAL of a legal config (`Object.prototype.loader = 42` →
"loader must be a function").

Three more, same file:

- the deferred-keys namespace was read off the hydration scratchpad with a member
  access, so an inherited array reconstructed promises the server never sent;
- `context: null` reached `Object.hasOwn`, which throws on it — from a
  **post-commit** interceptor, so `hydrateRouter` rejected while the router
  stayed active over a half-populated context. A non-null object is now
  required, and everything else falls through to the loader, as a missing
  context already did;
- a payload carrying the defer brand without a `deferred` bag was written to two
  claims BEFORE `Object.keys` threw on it. The shape is checked first now, and
  the error names the route and carries the plugin's prefix.

`getSsrDataMode` also gained the `try/catch` its `rsc-server-plugin` twin has
carried all along. Measured: a throwing getter on `state.context.ssrDataMode`
propagated out of a function whose twin documents "NEVER throws", so the two
readers were not substitutable. Both now collapse any read failure to `"full"`.

⚠ Two items in the issue no longer reproduced and were not "fixed" here:
`config.namespace in hydrationState.context` was closed by #1838, and `isDeferred`
reading an uncaptured `Object.hasOwn` by #1971. The issue's own table for the
non-object context is also stale — after #1838 only `null` threw; a string, a
number, a boolean and an array already fell through.
