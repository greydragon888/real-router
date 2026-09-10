---
"@real-router/vue": patch
---

`<RouteView>` flattens its slot tree without a spread

`collectElements` flattened nested slot arrays by returning a fresh array per level and spreading it into the parent — `result.push(...normalizeChildren(child))`. The spread passes one argument per collected VNode, and V8 caps spread arguments by the stack remaining at the call, so a wide enough nested fragment threw `RangeError: Maximum call stack size exceeded` — a message that reads like infinite recursion rather than "too many children". The walk now accumulates into the caller's array, which also removes the intermediate array per nesting level on a path that runs on every `RouteView` render.

Order and output are unchanged: the same markers, in the same slot order, and every non-marker entry still discarded.

⚠ **The `RangeError` is not why this changed.** A `<RouteView>` slot holds a handful of `<Match>` / `<Self>` / `<NotFound>` markers, so no real application approaches the width — measured here, the boundary sat between 400 000 and 500 000 VNodes in one nested array, and it drifted between runs because what gives out is stack, not a fixed argument limit. The reason is the per-level allocation; the overflow is simply the half a test can observe, and `route-view-slot-scale.stress.ts` pins it.

This is the same shape `@real-router/core` removed from `getStaticPaths` (#920), which carries a scale pin of its own. `react` and `preact` already write this walk as an accumulator, so the three adapters now agree.

Closes #2203.
