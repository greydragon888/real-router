---
"@real-router/core": minor
---

`resolveForwardChain` reads the name once, and returns a string (#1882)

The exported `resolveForwardChain` uses its route name as a property key, and the
walk asked the same question twice: `while (forwardMap[current])` tested one
coercion and `const next = forwardMap[current]` indexed another. A name that
answers differently between the two — an accessor- or `toString`-backed value —
had the second read index a route the first never named. Measured on a map
`{ alias: "users", other: "home" }`, a name answering `"alias"` then `"other"`
resolved to **`home`**: the forward target of a route nobody asked about.

It also makes the declared `: string` return true. With no entry in the map the
walk handed the caller's own object straight back.

The same holds for every HOP, not only the entry. The map's declared
`Record<string, string>` has exactly the status the name's `string` has — a
contract, not a runtime guarantee — and the walk asked a hop the same two
questions: the loop condition tested one value, the assignment took another, and
the raw value then went back to the top to be read as a key twice more. Measured
on the export with a plain-string entry `"a"` and a map `{ a: <answers "b" then
"c">, b: "usersB", c: "usersC" }`, the walk resolved to **`usersC`**; it now
resolves to `usersB`, and a hop that ENDS the chain comes back as a string
instead of as the map's own value. One read of the map per hop also fixes the
same divergence for an accessor- or `Proxy`-backed map.

⚠ Core itself cannot produce such a map — registration branches on
`typeof route.forwardTo === "string"` and sends everything else to the dynamic
map, so `config.forwardMap`'s values are strings by construction. This is about
the EXPORT's contract, which is the whole reason the entry read was worth fixing
too.

Nothing changes for a string caller, on any arm. A non-string one now behaves
exactly as its FIRST read names — which is what a single read means — instead of
its second.

⚠ This is deliberately a coercion and NOT a type gate. `ARCHITECTURE.md`
"Route-Name Type Gates" admits a gate only where a stable non-string already does
damage; here a stable one answers exactly what its `toString` says. It is also
the one door of this family with no validator seam — a free function has nothing
for `@real-router/validation-plugin` to hook, and that plugin is one of its own
consumers.
