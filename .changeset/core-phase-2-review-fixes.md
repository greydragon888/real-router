---
"@real-router/core": patch
---

Fix four defects an RFC review found in nav-pipeline Phase 2 (#1548)

**`buildPath` disagreed with every other producer again.** Step 2-1's
`withholdFilledSlots` — the rule that stops a route default replacing a value the
caller supplied — applied to any key, not only to a name the route declares with
`?`. Only a declared query name can HAVE a params-bag twin, so on anything else
it withheld a default nobody was competing for:

```ts
// Route: /u with defaultSearch { theme: "dark" }  (theme declared nowhere)
buildPath("u", { theme: "X" }); // "/u"  — every other producer commits "/u?theme=dark"

// Route: /items/:id?id with defaultSearch { id: "D" }  (the #843 carve-out)
buildPath("coll", { id: "V" }); // "/items/V"  — navigate commits "/items/V?id=D"
```

That is the #1552/#1578 class the step set out to close, and round-trip broke in
the sharp direction: `matchPath` rewrote the printed href into a different URL on
the spot. The rule is now scoped to `?`-declared names, so the documented
single-bag retirement is unchanged (`buildPath("x", { page: "9" })` on
`defaultSearch { page: "5" }` still prints `/x`, not `/x?page=5`).

**`state.search` could be unfrozen.** The mode gate's drop branch is the one
place a channel is rebuilt after `mergeWithDefault` froze it. Every pre-Phase-2
consumer re-merged downstream in `makeState` and re-froze it by accident;
`materialize` deliberately does not, so a state whose query the gate had touched
shipped with a mutable `search`, against "states are deeply frozen".

**A route codec could no longer edit its `search` argument.** `buildPath` copied
`canonical.path` before handing it to `encodeParams` but passed `canonical.query`
through verbatim — and the canonical channels are frozen, so a codec that edits
in place silently lost its query edit (or threw, under ESM). Both channels are
copied now.

**The #1579 diagnostic's opt-in gate did nothing.** `port.reportUndeclaredParamKey`
was a closure forwarding into an optional-chained validator, so it was always
truthy: the "absent unless `validation-plugin` is installed" gate read as taken
and bare core walked the caller's params bag on every commit. It is a getter
returning `undefined` while no validator is installed, which is what the port's
own contract said all along.
