---
"@real-router/core": patch
---

fix(core): one `Object.create` put a forbidden getter past the dependencies guard (#1799)

`guardDependencies` enumerated with `for…in`, which walks the prototype chain, and
then asked `Object.getOwnPropertyDescriptor`, which answers only about OWN
properties. For an inherited name the descriptor is `undefined`, so `?.get` never
fired: the guard iterated exactly the names it could not judge.

```
CONTROL  an OWN getter                 -> TypeError: dependencies cannot contain getters: "svc"
         the SAME getter, one Object.create away
           before  ACCEPTED, and get("svc") returns the getter's value
           after   not a dependency at all
```

The walk is own-only now, through the module-level `objectKeys` capture this file
already had — the same set the copy loops walk, so nothing gets past one half that
the other half never judged.

⚠ **Honest boundary: the walk change buys COHERENCE, not a different verdict.**
For an inherited name `getOwnPropertyDescriptor` answers `undefined`, so `?.get`
could never fire on the extra names `for…in` visited — measured across six bag
shapes, both forms return the identical verdict on every one. What actually keeps
an inherited getter out of the store is the copy loops, which now walk the same
own-key set. The one thing the change does alter is the BINDING: `for…in` is
syntax and cannot be re-pointed, and an early draft of this fix reached for the
raw `Object.keys` instead of the capture — measured, a post-boot shim then walked
a forbidden getter straight past the guard. That is what the new
`reads the CAPTURED Object.keys` cell pins; no behavioural cell can tell the two
walks apart.

⚠ The always-on guard runs at construction only (`Router.ts`). `setAll` and
`cloneRouter` reach the store without it — `@real-router/validation-plugin` covers
`setAll`, nothing covers `cloneRouter`'s override bag. Unchanged here, and stated
because the copy-loop half of this fix does apply to all three doors.
