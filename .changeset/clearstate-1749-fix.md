---
"@real-router/core": minor
---

fix(core): the committed pair has one writer — the table ([#1749](https://github.com/greydragon888/real-router/issues/1749))

`RouterInternals.clearState` reached the committed-state write primitive with no precondition in front of it, and `RouterInternals` is type-exported from the **published** `./validation` subpath. Calling it on a live router reproduced exactly the shape #1612 removed from `clear()`:

```ts
getInternals(router).clearState();

router.getState();         // undefined — dropped, and NO event was emitted
router.isActive();         // true
router.navigateToNotFound(); // throws ROUTER_NOT_STARTED on a started router
```

The guard #1612 wrote lives in `clear()`, not in the cells, so a caller reaching the primitive by another door met nothing.

**Removed, not guarded.** `ctx.clearState`, its declaration, its `Router.ts` closure and `StateNamespace.clearCommitted` are gone. `clear()` is legal only on a STOPPED router (#1612), where `current` is already `undefined` — measured, so the shift only ever moved `previous`, and #1663 adjudicated that a residue rather than a contract. The observable change is exactly that: **`getPreviousState()` now survives `clear()`.**

⚠ **Breaking for a consumer that typed against `RouterInternals`** — the member is gone from the published type. Measured radius in-repo: zero call sites outside `packages/core/src`.

The payoff is structural: the FSM table is now the **sole** writer of the committed pair, and that is enforced by two mechanisms that cover different shapes — measured, not assumed:

| foreign write | `readonly` on the cells | the authority scan |
| --- | --- | --- |
| `ctx.current = x` | `TS2540` | caught |
| `ctx["previous"] = x` | `TS2540` | added here |
| `Object.assign(ctx, { current: x })` | **passes** | added here |
| `({ current: ctx.current } = snapshot)` | `TS2540` | **passes** |

They are complementary rather than belt-and-braces: each covers the shape the other lets through, and together they cover all four. `readonly` additionally reports at the moment of the edit rather than on the next tier run. The three table `update`s take a module-private mutable view — TypeScript does not track `readonly` across assignment, so the engine still hands them the same object.

Not changed: `stop()` still shifts the pair and `dispose()` still zeroes both — those are table edges, measured unchanged. ⚠ Neither was pinned by anything: removing either left 4176 functional and 453 property tests green. `stop()`'s shift is now pinned as a side effect, because the state clause above compares `previous` across `clear()` and is vacuous without it; `dispose()`'s zeroing remains unpinned and is out of this fix's scope.
