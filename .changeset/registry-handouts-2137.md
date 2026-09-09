---
"@real-router/core": minor
---

The query- and path-name registries are handed out sealed, so a caller cannot rewrite what core treats as declared

`getQueryParams` memoises the route's declared query names in the routes store and returned **the cache entry itself**. Four doors published those memoised arrays — `getInternals(...).getQueryParams` and `port().queryNames`, which are literally the same array, plus `port().pathNames` and the matcher's own `getDeclaredQueryParams`, which are two more — so writing to one edited a table the channel guard and the mode gate consult, rather than a copy.

Under `queryParamsMode: "default"` or `"strict"`, measured:

```js
getInternals(router).getQueryParams("q").push("nope");
makeState("q", { id: "1" }, { tab: "x", nope: "z" });
// search was {"tab":"x","nope":"z"} — the undeclared key became declared
// (the URL still printed /q/1?tab=x, so the state stopped round-tripping
//  through its own state.path)

getInternals(router).getQueryParams("q").length = 0;
// search was {} and buildPath was /q/1 — a DECLARED key dropped from both
```

The path-name registry reaches the same outcome by a different route, and the ORDER is what makes it work: `queryParamsFor` computes `declared.filter(p => !urlParams.includes(p))` once and caches the answer, so a push into `pathNames` only reaches that subtraction while the query cache is still cold. After a navigation the same push is inert — which is how this half reads as absent when probed second.

Third shape, on the same axis: `Array.prototype.filter` performs ArraySpeciesCreate on its receiver, so a `constructor` planted on the matcher's declared list decided the class of the array core cached — measured, `getQueryParams` answered with an instance of the planted subclass.

**All three are closed by sealing each registry where it is built** — `declaredQueryParams` at compile time (beside `matchSegments`, which was already frozen), and both store caches at the point the entry is cached. Freezing the source also takes away the species vector, since the plant can no longer be made. The accessors' return types are `readonly string[]` now, so the compiler carries the same statement.

⚠ **This is a behaviour change for a caller that was writing to those arrays.** In strict mode — which module code is — the write now throws a `TypeError` instead of silently succeeding. No existing test needed changing in the two packages that were run — `core` (5227) and `validation-plugin` (835, the only consumer outside core that names these accessors). The remaining packages are covered by the full build, which is the reviewer's step.

⚠ **What this does NOT close, stated rather than implied:** the cache `Map`s remain editable through `getInternals(...).routeGetStore()`, and no freeze can change that — `Object.freeze` on a `Map` does not refuse `set`, because entries live in internal slots. That handle is the documented live-store carve-out, and reaching it is a strictly larger capability than reaching a registry.

⚠ **Under the DEFAULT `queryParamsMode: "loose"` none of this was observable**, because loose admits an undeclared query key whatever the registry says. A reproduction written without the mode axis measures the mode, not the defect.

The added work is on the cache-MISS path only — one `Object.freeze` per route per router, where the array is built. A warm read is the same `Map.get` it always was.

Closes #2137.
