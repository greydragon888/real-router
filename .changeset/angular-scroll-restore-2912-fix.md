---
"@real-router/angular": patch
---

`scrollRestoration` restores the saved position on Back and Forward under `@real-router/browser-plugin` and `@real-router/memory-plugin` (#2912)

`mode: "restore"`, the default, read a step through history only from `state.context.navigation`, which `@real-router/navigation-plugin` alone writes. browser-plugin and memory-plugin commit a step as a replace, so under them Back and Forward — memory-plugin's `back()`, `forward()` and `go()` — took the replace skip and left the scroll where the page being left had it. The utility now also reads `state.context.browser.source` and `state.context.memory.direction`, and restores the position saved for the location, or the top when none is saved.

- Under browser-plugin, a fragment navigation — an in-page anchor, `location.hash = …` — and Back from its entry onto the page it was made on still leave the scroll where it is. When that Back is the second of two quick Backs across the entry, pressed while an async guard of the landing route holds the first, it restores the page's saved position.
- Without a `scrollContainer`, a restore is re-applied on each frame, for at most ten more, until the page is tall enough to hold the position, instead of one write that clamps short while the page still grows. A scroll the user makes during those frames is overridden.
- A container restore stops at the first frame where the container can hold the position. A `behavior: "smooth"` restore into a container that already can writes once, instead of on every frame of the budget.
- A navigation that commits while a restore is pending retires it, before its first write too, unless it is a replace on the same route that neither steps through history nor reloads — a scroll-spy update, a query synced into the URL. A push used to leave a container restore running, and it wrote the previous route's position onto the new page once that page grew.
- Under jsdom, which lays nothing out, a restore of a saved position above 1 px calls `scrollTo` on each of up to 11 frames instead of once — a window restore, and an instant container restore whose stubbed `scrollTo` sets `scrollTop` to it. A test counting the calls sees it; stubbing `scrollHeight` and `clientHeight` so that the target can hold the position brings it back to one call.

Under `@real-router/hash-plugin`, Back and Forward still leave the scroll where it was: the plugin publishes no step through history.
