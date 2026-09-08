---
"@real-router/core": patch
---

Three doors read the caller's params bag once, and hand that read to the validator (#2134)

`buildPath`, `navigate` and `canNavigateTo` take a copy of the path bag at the
door and use it for everything below: the `forwardState` seam, the merge, and
the argument validation layer. With `@real-router/validation-plugin` installed a
key that answers differently per read was judged on one value and shipped on
another — measured, `buildPath` printed `/b/v3` after the validator had admitted
`v1` and `v2`, and `navigate` printed `v4`. All three doors now answer exactly
what bare core answers.

⚠ The copy is content-preserving and is NOT `normalizeChannel`. An `undefined`
value is `@real-router/persistent-params-plugin`'s removal marker and is read at
the seam: stripped above it, `navigate("b", { id: "2", page: undefined })` leaves
`?page=7` on the URL instead of clearing it. The strip stays below the seam,
where an interceptor's own injected `undefined` still needs it. #1849 records the
same measurement from the other side.

⚠ Two doors grow a net around the new read, because the read is application
code. `canNavigateTo` answers `false` when the bag's getter throws — it is
documented total (INVARIANTS canNavigateTo #5) and its old net sat below the
seam. `navigate` returns a REJECTED promise rather than throwing synchronously,
so a getter that throws still lands in the caller's `.catch()`.

The seam sees core's copy rather than the caller's object on both producers, and
that is #2087's rule holding rather than bending: one seam, one input shape, and
both doors copy at the same point. Keys, values and an own `__proto__` all cross
unchanged.

⚠ `isActiveRoute` is deliberately NOT in this change. It returns a boolean and
ships no value out of the bag, so there is no shipped read to align a judged one
with; a copy there costs a measured +48 % on a door every `<Link>` in six
adapters runs on every render, and buys nothing bare core does not already have.
