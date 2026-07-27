---
"@real-router/core": minor
---

Light up a `<Link>` whose route forwards elsewhere (#1573)

`isActiveRoute` compared the given name against the committed state and never
resolved `forwardTo`, so a link pointing at a forwarding route was dark on the
very page it navigates to:

```ts
// s2 → d2,  s2.defaultParams = { z: "5" },  d2 = "/d2/:z"
await router.navigate("s2", {});   // commits /d2/5
router.isActiveRoute("s2", {});    // false  ← the link the user just clicked
```

It gains a second arm — `literal || destination` — where the destination repeats
**the same predicate** on the full output of stage ①: the resolved terminal name
together with the chain's defaults layered into the target's channels.

Three measured reasons it is that shape and not a simpler one:

- **A fallback, not a pre-resolution.** Resolving before comparing would send a
  section link (`users` forwarding to `users.list`) to the leaf and darken it
  while a sibling descendant (`users.profile`) is active. The literal arm is
  what keeps that link lit.
- **The predicate is repeated on ①'s OUTPUT, not on a substituted name.** The
  chain's `defaultParams` live on the forwarding SOURCE and are layered by
  `forwardState` (#1566/#1570) — never by the forward map — so substituting only
  the name still compares an empty bag against a committed `{z:"5"}`. It also
  carries no `search`, which is where ① routes a hop default whose key the
  target declares with `?`.
- **A dynamic `forwardTo` is not in the forward map at all**, so name
  substitution is a no-op there; going through stage ① resolves it.

Cost is gated: a route that does not forward pays one `Object.hasOwn` and
returns, so the six adapters calling this on every `<Link>` render are
unaffected. The arm calls the namespace primitive rather than the interceptable
seam, so no plugin interceptor chain runs per render. A dynamic `forwardTo`
callback that throws is caught — the predicate answers `false` and logs, it
never throws from inside a render (same policy as `canNavigateTo` on a throwing
guard, #959).

Unchanged on purpose: `buildPath("s2")` still prints `/s2`, not the destination
— href-is-not-destination for `forwardTo` is a separate, deliberate decision.
