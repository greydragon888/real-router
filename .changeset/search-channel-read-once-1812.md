---
"@real-router/core": patch
---

fix(core): read the caller's query bag once, not twice (#1812)

The query channel read every key of the caller's bag **twice** and shipped the
second value while the admission decision was made on the first. Traced, because
the obvious reading of the code is wrong:

```
read 1  stripUndefined  <- mergeDefined <- mergeWithDefault
read 2  mergeWithDefault (its own spread of the same bag, to copy before freezing)
```

`stripUndefined` tests each key to decide whether anything must be dropped, and
`mergeWithDefault` then spreads the same bag to copy it. Both operands can be an
object the caller owns, which this codebase supports as accessor- or Proxy-backed
(`opts` says so explicitly, and `params` / `search` arrive the same way from a
reactive store). So a key was ADMITTED on one value and COMMITTED with another,
and the resulting `state.search` could contradict its own `state.path` — the
invariant `makeState` #6 exists to hold.

⚠ **There are TWO two-read paths, and the trace above is only one of them.** The
count is 2 either way, which is why one number hid two mechanisms:

- **no route default** — the trace above: `stripUndefined` gates, `mergeWithDefault`'s
  own copy takes. Two different functions, so collapsing `mergeDefined`'s
  gate-then-value pair leaves the count at 2, measured.
- **the route HAS a `defaultSearch`** — both reads inside `mergeDefined`'s second
  loop. Collapsing that pair is exactly what fixes this one, and #1792 already
  did it while restructuring both loops for the `__proto__` guard: measured
  `reads=1` on that path before this change. #1812's own reproduction declares a
  `defaultSearch`, so the case it reports is the case that is already closed.

This change closes the first path and makes the second structural rather than
incidental — one normaliser for both channels, so neither merge ever sees an
object the caller owns.

**Fixed by routing, not by adding a check.** The path channel never had the
defect because it has always arrived normalised, so the query channel is routed
through the same normaliser and handed over as owned.

⚠ **Only on the arm with no route default.** `mergeWithDefault` tests
`defaultValue !== undefined` FIRST and returns `freeze(mergeDefined(...))` without
consulting `valueIsOwned` at all, so a route that declares a `defaultSearch` /
`defaultParams` — which is the shape #1812's own reproduction uses — takes the
merge branch, not the owned one. An earlier revision of this paragraph said "both
`canonicalize` merges now take the owned fast path", which is false on exactly the
reported case. The flag is also behaviourally inert here: with `searchBag` already
normalised, the unowned branch reproduces it key for key (measured across 20
observables — reads, contents, key order, path, frozen-ness, prototype, symbol
handling, singleton reuse — zero differ). It buys one allocation and two reads of
core's OWN object, so it is a perf choice, not a correctness one, and it is
correctly not pinned by a behavioural test.

⚠ `mergeWithDefault`'s unowned branch **stays**, and the earlier draft of this
change deleted it. That was sound while `canonicalize` was its only caller; it is
not since #1792, which added five more — `navigateToState` and `systemCommit`
copy a `State` handed in through a published API, verbatim. Deleting the branch
there would freeze a foreign object in place, commit it by reference, and skip
the `__proto__` guard on the copy: the three things #1792 exists to prevent. The
`valueIsOwned` parameter stays with it, and its contract is now "the pipeline
may pass it, the commit doors may not".

`normalizeParams` becomes `normalizeChannel(bag, empty)` — one implementation for
both channels, taking the empty singleton as a parameter because `EMPTY_PARAMS`
and `EMPTY_SEARCH` are distinct frozen objects compared by identity.

⚠ The empty bag becoming a PARAMETER is a new hazard, and it is the one thing
here that did not exist before: the path normaliser named `EMPTY_PARAMS` as a
constant, so the two channels could not be crossed. Handing a channel its
sibling's singleton makes both commit the SAME object, and it passed the whole
suite — pinned now by `empty-params-reuse.test.ts`, "keeps the two channels on
DISTINCT empty singletons". ⚠ That cell passes its bags EXPLICITLY: with the
argument omitted `canonicalize` short-circuits before the normaliser and the swap
is invisible.

**Six** doors accept a query channel (`INVARIANTS.md` 2a), not four, and every one
of them reached the two-read pair. All six now read once: `navigate`, `buildPath`,
`isActiveRoute`, `makeState`, and — named here because an earlier revision omitted
them and the read-count table had no row for either — `canNavigateTo` and
`buildNavigationState`. Rows added for both; `canNavigateTo` had a `· params` row
and no `· search` row, an asymmetry inside the table that reads as coverage the
same way a missing door does.

**One `__proto__` guard, at the channel boundary.** Routing both channels through
`normalizeChannel` means its `UNSAFE_KEY` skip (#1792) is where the key is dropped
for a bag that arrives from the CALLER — where the guarantee previously rested on
two copiers on different paths. ⚠ Not "the single place": a route's own
`defaultParams` / `defaultSearch` is a second supported source and never passes
through the normaliser, so `mergeDefined`'s own skip drops it there. The merges
keep their guards as the backstop both for that operand and for the five call
sites that do not come through the normaliser.

Measured, 3 alternating runs each on a loaded machine, medians: `buildPath` with
one query key −1.2 %, three query keys +0.3 %, three path params −3.5 %. No
regression; the deltas sit inside the noise of a non-quiet machine, so this is
"no measurable cost", not a claimed win.
