---
"@real-router/core": minor
---

A `forwardTo` hop reads the caller's bag once, on both channels (#1848)

#1812 routed both channels through `normalizeChannel` so the merge never sees an
object the caller owns. That held for a direct navigation and not for a hop:
`mergeDefined(undefined, bag)` short-circuits to `stripUndefined`, which reads
every key and then returns **the same object** when there is nothing to strip, so
the caller's bag flowed on to `canonicalize` and was read a second time.

Measured, route `src → u` with the hop carrying no defaults:

| door | before | after |
| --- | --- | --- |
| `navigate` | params 2, search 2 | 1, 1 |
| `canNavigateTo` | params 2, search 2 | 1, 1 |
| `isActiveRoute` | params 2, search 2 | 1, 1 |
| `buildNavigationState` | params 2, search 2 | 1, 1 |

⚠ Only a hop carrying **no** defaults leaked — the plain alias, which is the
common one. A hop with `defaultParams` / `defaultSearch` already read once,
because the merge allocates and the caller's bag stops flowing there.

These bags are accessor-backed in practice without anyone writing a getter — Vue
`reactive()` and Svelte `$props()` produce them — so the second read was the
router calling into application code twice for one question. No outcome changes:
the committed `params` / `search`, the printed URL, and what a `forwardState`
interceptor receives are byte-identical to the previous release.

Two shipped claims were false and are corrected by the guard rather than by
prose: #1812's "the PATH channel is immune … (measured: 1 read)" is true only of
a direct navigation, and PR #1820's "pinned by the read-count table" had no
forwarding row to pin it with. The table has one now, per channel per door.
