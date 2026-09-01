---
"@real-router/rsc-server-plugin": patch
---

The SSR loader factory reads caller-supplied bags by own key (#1835)

This package and `@real-router/ssr-data-plugin` consume one generic factory,
`shared/ssr/createSsrLoaderPlugin.ts`, so the CODE in its sibling changeset is
the same code here: the compiler and the validator now gate each entry's
`ssr` / `loader` with `Object.hasOwn`, the hydration scratchpad's deferred-keys
namespace is read by own key, a non-null object is required before the scratchpad
is consulted, and a branded payload's shape is checked before anything is
written.

⚠ Sharing the code does not mean sharing the symptom, and one of the four
diverges — see below.

The loader hijack needed no deferred namespaces and reproduced here exactly as it
did there; measured after the fix, an inherited `loader` runs zero times.

⚑ The forged-brand item did NOT reproduce here, and the fix does not make the two
plugins agree — it makes the disagreement safe on the side that was unsafe. This
plugin configures no deferred namespaces, so `deferredClaims` is `null` and
`isDeferred` is never consulted; measured, a branded payload resolves normally
and lands in `state.context.rsc` verbatim. What changed is the other side:
`ssr-data-plugin` used to write two claims and then reject on a bare
`Cannot convert undefined or null to object`, and now refuses before writing
anything.
