---
"@real-router/core": patch
---

refactor(core): the removal refusal is a name prefix again — the chain walk decided nothing after #1763 ([#1757](https://github.com/greydragon888/real-router/issues/1757), [#1763](https://github.com/greydragon888/real-router/issues/1763))

`validateRemoveRoute` asked the matcher's segment chain whether the committed route sits inside the subtree being removed. #1757 put that walk there because core accepted a dotted **leaf**: `{ name: "x.y" }` beside `{ name: "x" }` matched `startsWith("x.")` and made `remove("x")` refuse with `it is currently active (current: "x.y")` — false about a route nothing was removing.

#1763 removed the shape rather than the symptom: a route name cannot carry a dot, so a dotted committed name implies its ancestor **exists and is a real ancestor**. The walk, its `matcher` parameter and an O(depth) lookup are gone; the predicate is `currentStateName.startsWith(`${name}.`)` again.

Measured before touching it, on every shape still constructible — the two forms agree on all of them.

⚠ **The sibling half of #1757 is NOT equivalent and stays.** `spliceSubtree` still reports the names the splice actually took, and the config/lifecycle purge is still driven by that exact set, because the **lifecycle registry is the one registry `add`/`replace` never gated**: `addActivateGuard` takes a bare string, so an external guard can still be held for a dotted name that is not a route. Clearing it by prefix is precisely the fail-open #1757 was filed for — `remove("x")` silently unregistering a guard the application registered for `x.ghost`. Mutationally checked: widening the set back to the prefix reds that cell and only that cell.

That cell had been retired during #1763 as "unconstructible", which was wrong — only its old construction path (`add({ name: "x.ghost" })`) went away, not its subject. It is restored here on the path that still exists, a nested re-creation.
