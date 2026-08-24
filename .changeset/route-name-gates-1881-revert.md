---
"@real-router/core": minor
---

`isActiveRoute`, `forwardState` and `buildNavigationState` stop type-checking the route name (#1881)

The three gates shipped in `0.98.0` are reverted, and `ARCHITECTURE.md`
**"Route-Name Type Gates"** now carries the rule that decides which doors get
one at all:

> A door gates the name when a **stably-coercing** non-string already does
> damage there — it runs application code as a side effect, it produces an
> object whose own fields disagree, or it ACCEPTS a registration that can then
> never take effect. A door that merely answers what the value's `toString`
> named does not gate: it degrades, and `@real-router/validation-plugin`
> diagnoses it at the call, before any read.

**Behaviour change, and only for a non-string route name** — a JavaScript
consumer, an `any`-typed value, or a config assembled at runtime; TypeScript
rejects the shape. A plain string is unaffected on every door. Measured, router
on `/home`, a bag whose `toString` returns `"fwd"`, where `fwd` declares
`forwardTo: "home"`:

| door                   | `0.98.0`              | now                |
| ---------------------- | --------------------- | ------------------ |
| `isActiveRoute`        | `false`               | `true`             |
| `forwardState`         | the value, unresolved | resolves to `home` |
| `buildNavigationState` | `undefined`           | a State for `home` |

Each is the answer the coercion names. `@real-router/validation-plugin` throws
on all three at **0** reads, and a new test in that package pins both halves —
the throw and the read count — so a seam that moved below the first
property-key read would fail rather than quietly stop being a diagnosis.

**What this does not touch.** `defaultRoute` keeps its gate (#1876): measured on
bare core with that gate deleted, an `any`-typed callback returning a bag naming
a route with `forwardTo` **navigates to the target** — a transition nobody
requested — and `navigateToDefault()` takes no name argument, so the validator
cannot answer at the call. `buildPath` (#1889, its `encodeParams` RUNS before a
guaranteed throw) and the four-argument `makeState` (#1883, it returns a State
whose `name` is the caller's object beside the coerced route's `defaultParams`)
are on the rule's damaging side and keep their open issues.

⚠ One issue closes as a consequence rather than by a fix: `#1891` reported the
`<Link>` fast path diverging from core for a non-string name. Measured on this
branch, core, the shared name selector, the fast path and the slow path now all
answer identically — the divergence was the gate.
