---
"@real-router/core": patch
---

Forward-chain refusals name `[router]` instead of nothing (#2456)

Six forward-chain refusals carried no prefix, so a reader could not tell which call
produced them — while the refusal raised beside them at the same door said
`[router.addRoute] Route "x" already exists`. They now open with the bare
`[router]`:

```diff
-Circular forwardTo: a → b → a
+[router] Circular forwardTo: a → b → a
```

Two raisers, both serving several doors. `resolveForwardChain` runs at
registration, reached from every door that touches the forward map — the four that
register one (`createRouter`, `routes.add`, `routes.replace`, `routes.update`) plus
the re-resolve behind `routes.remove` — and it is a **root export**, so a caller
can invoke it directly and there is no facade door to name.
`#resolveDynamicForward` runs on the match path, so `start`, `navigate` and the
plugin primitives all surface it. The bare facade is the shape #1845 settled on for
the twelve `registration/errors.ts` messages, for exactly this reason: a single
call name would be false at the other doors.

The four messages of the callback path — `Circular forwardTo`, `Route "x" does not
exist`, `forwardTo callback must return a string` and `forwardTo exceeds maximum
depth of 100` — take the prefix as well. The issue named one of them; the other
three are the same function and the same doors.

⚠ **A caller matching on these strings sees a changed string.** No pin anchored one
of these six, so the substring matches kept working; the one that had to change is
the door table `@real-router/validation-plugin` added in #2399, which registered
the cycle message as carrying no prefix and now registers `[router]`. An exact or
anchored match in application code is what stops firing.

The prefix authority gained the tier that makes this mechanical. It policed WHICH
prefix a message uses and answered `undefined` for a message with none, which is
how these six stayed invisible. It now also **partitions every `throw` in
`packages/core/src`** — a literal `throw new X("…")`, a `throw new X(value)` whose
text is not in the tree, a `throw factory(…)`, a re-thrown `throw error` — and
holds a register of the thirteen literal refusals that still carry no prefix. The
register is a backlog, not an approval: a new bare refusal reds until it is
prefixed or recorded, and a `throw` shape the rule cannot judge is still counted,
so it cannot arrive unnoticed either.
