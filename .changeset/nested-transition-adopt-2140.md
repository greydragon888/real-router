---
"@real-router/core": minor
---

`systemCommit` adopts a foreign `transition` at every level the shape declares, not just the meta

`getInternals(router).systemCommit(state, …)` is the one door that **commits** a `State` built outside core — `navigateToState` accepts one too, but runs it through the pipeline, which constructs and freezes its own. So this door copies the shell field by field, and nothing the caller still holds is committed as core's own (#1792). The copy stopped at the meta. `Object.freeze` is shallow, so `transition.segments` and the two arrays inside it stayed the caller's objects, live and unfrozen, while core handed them out as part of its own state:

```js
const segments = { deactivated: ["old"], activated: ["new"], intersection: "" };
const state = {
  name: "b",
  params: {},
  search: {},
  path: "/b",
  context: {},
  transition: { phase: "activating", reason: "success", segments },
};

getInternals(router).systemCommit(state, undefined, {});

router.getState().transition.segments === segments; // true
router.getState().transition.segments.activated.push("x"); // silently rewrote published state
```

The `segments` container is now adopted the way the meta above it already was — own keys only, `__proto__` and `undefined`-valued keys dropped, copied and frozen. Every own value of it that is an array (the declared shape has two, `deactivated` and `activated`) is copied and frozen in turn. The arrays are copied rather than sealed in place, so a caller's own object is never frozen out from under it, and the copy is taken with a captured `Array.prototype.slice` rather than by asking the array for its own.

The depth stops where the declared shape does, and that boundary is measured rather than chosen: the ordinary `navigate` pipeline hands back an array sitting in a param slot (`params.tags`) as the caller's own object, unfrozen, while `buildTransitionMeta` freezes `segments` and both of its arrays. Containers that are part of the state shape are core's; values the caller puts in them are the caller's.

**Behaviour change: both nullish spellings of an absent `transition` are now absence.** The conditional that guards the slot tested `!== undefined`, so `transition: null` fell through to the adoption's empty answer — the shared `EMPTY_PARAMS` singleton, committed under a type that declares `phase`, `reason` and `segments` as required. `getState().transition` was then the same object as some other state's `getState().params`. It is omitted now, exactly as `undefined` already was; `State.transition` being reachable as absent at this door is the pre-existing, pinned behaviour that `RoutesNamespace.shouldUpdateNode` reads through `?.` for.

Consumers that already treated `getState().transition` as deeply frozen — which is what `State.md` ("the `transition` field and its nested objects are deeply frozen", "including the arrays") and `packages/core/ARCHITECTURE.md` both state — see no change; the documentation was describing the contract this restores. A consumer that was writing to `getState().transition.segments` or its arrays after a commit through this door now gets the `TypeError` every other producer already gave it.

Closes #2140.
