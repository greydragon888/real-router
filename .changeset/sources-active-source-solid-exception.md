---
"@real-router/sources": patch
---

`createActiveSource` claimed every adapter Link routes through it — Solid does not (#2126)

Five adapters resolve active state through this builder. `solid/src/components/Link.tsx` carries its own fast/slow decision instead — the `routeName !== ""` guard duplicated, the fast path going to a `createSelector` built in its `RouterProvider` rather than to `createActiveNameSelector`. The subscription shapes differ with it: one source per router here, one per link there. That is the #1416 axis, still open in the one adapter the docblock claimed was covered.
