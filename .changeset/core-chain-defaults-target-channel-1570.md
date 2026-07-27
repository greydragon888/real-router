---
"@real-router/core": minor
---

Layer a `forwardTo` chain's defaults into the channel the TARGET declares (#1570)

A forwarding hop can only spell a default in `defaultParams` — that is the single
slot a route config gives it. But the **channel** belongs to the resolved target:
when the target declares that key with `?`, the value is a query value, and
`forwardState` was layering it into the path bag regardless.

```ts
// src → dst,  src.defaultParams = { lang: "fr" },  dst = "/dst?lang"
// stage ① before:  { name: "dst", params: { lang: "fr" }, search: {} }   ← wrong channel
// stage ① now:     { name: "dst", params: {},             search: { lang: "fr" } }
```

The split reuses `separateChannels` over `getQueryParams` — the same classifier
and the same printing registry the URL build reads (#1556) — so no second
derivation of "which channel is this key" is introduced. A name that also
occupies a path slot (`/dst/:id?id`) stays path-owned, inheriting the #843 /
#1549 carve-out rather than re-deciding it. An explicit caller value still beats
the layered default, in **both** channels.

**Observable only to `forwardState` interceptors.** The committed state is
byte-identical: channel separation at the seam moved the key one line later, so
`state.params` / `state.search` / `state.path` were already correct end-to-end.
What changes is what a plugin's `forwardState` interceptor reads from `next(...)`
— which is the point: stage ① is now channel-correct at the producer, and core
stops being the one producer its own channel contract could not cover.

The whole suite stays green with no test migrated.
