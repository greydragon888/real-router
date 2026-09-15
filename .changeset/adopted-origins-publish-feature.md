---
"@real-router/core": minor
---

Publish the `AdoptedOrigins` type from `@real-router/core/types` (#2339)

`RouterInternals.getAdoptedOrigins` hands this record out, and until now its type
was declared inside `namespaces/OptionsNamespace/adoption.ts` — reachable in code,
nameable from nowhere. A consumer could hold the value and not write its type.

The interface moves to `types/router.ts`, beside `Options`, which is where this
package puts a public API type, and the barrel names it. No runtime change: the
record, its two optional `WeakRef` fields and every producer are untouched.

This is the precondition for moving `getAdoptedOrigins` onto `PluginApi`: a member
of a published surface must carry a type a consumer can name.
