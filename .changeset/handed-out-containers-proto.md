---
"@real-router/core": patch
---

fix: what core hands out is no longer a prototype-swap primitive (#1957)

An own `"__proto__"` on a container is inert while it sits there and becomes a
prototype swap the moment a consumer merges it with `Object.assign` or a `for…in`
copy — both `[[Set]]` that name on the TARGET, where `Object.prototype`'s
accessor replaces the target's prototype instead of adding an entry. (A spread
is safe: it defines rather than sets.) `JSON.parse` and
`Object.fromEntries(new URLSearchParams(…))` both mint the key, so no
adversarial construction is involved.

`getDependenciesApi(router).getAll()` was hardened this way at #1823. Four more
doors had the same shape and no such withholding:

```js
const r = createRouter(routes, JSON.parse('{"defaultRoute":"home","__proto__":{"pwned":"YES"}}'));

Object.assign({}, getPluginApi(r).getOptions()).pwned; // was "YES" -> now undefined
```

- `getPluginApi(router).getOptions()` — and with it
  `getInternals(router).getCloneState().options`, so a clone's options were
  polluted too. One fix covers both because it is applied at the SOURCE, in the
  `OptionsNamespace` constructor: the two doors are not one object (the second
  is an unfrozen spread of the first).
- `getInternals(router).getCloneState().dependencies`.
- `getInternals(router).getMetaForState(name)` for a route named `__proto__`.
- the `NavigationOptions` a plugin's `onTransitionSuccess` receives, on the two
  arcs where core MINTS the object (`stripSignal`, and the forced replace out of
  `UNKNOWN_ROUTE`).

Two shapes, picked by one question — does core read that key back off the very
object it published?

- **No → the key is dropped.** The copy exists only to be handed out.
- **Yes → the key is withheld from ENUMERATION** (a non-enumerable own
  property), at exactly one site: the route-meta record. Dropping is not a
  milder fix there but a wrong one — core reads `meta[segmentName]` on every
  navigation, so with the entry gone the read reaches the inherited accessor and
  answers `Object.prototype`, an object with no keys, i.e. "params unchanged".
  Measured: a route named `__proto__` stops re-activating when its `:id`
  changes.

⚠ **Behaviour change.** A dependency literally named `__proto__` is still held
by the base router and still answered by `get()`, but it no longer reaches a
`cloneRouter` clone. That is the trade #1823 already took at `getAll()`: a
single read hands back a VALUE, a door hands back a CONTAINER someone will
merge, and only the second is withheld.

⚠ The fix reaches the TOP level of each container and no further. One level
down are the caller's own objects, handed back by reference under core's
one-level copy model (#1958) — `getOptions().defaultParams` and a dependency's
value still carry whatever the caller put there. Pinned, not assumed.

Five doors stay exempt, each with a measured reason recorded in
`tests/functional/handed-out-containers-1957.test.ts`: `state.context` (#1191)
and a route's custom fields (#1788), both prior owner decisions; `forwardState`'s
bags and the un-forced `NavigationOptions` arc, where the container is the
caller's own object and core minted nothing; and the internals handle, which
exists to hand out core's live stores.
