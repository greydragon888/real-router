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
through the same normaliser and handed over as owned. Both `canonicalize` merges
now take the owned fast path and freeze in place.

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
and `EMPTY_SEARCH` are distinct frozen objects compared by identity. Four doors
were affected and all four now read once: `navigate`, `buildPath`,
`isActiveRoute` and `makeState`, pinned by the read-count table.

**One `__proto__` guard, at the channel boundary.** Routing both channels through
`normalizeChannel` means its `UNSAFE_KEY` skip (#1792) is the single place the key
is dropped for a pipeline-produced state — where the guarantee previously rested
on two copiers on different paths. The merges keep their own guards as the
backstop for the five call sites that do not come through the normaliser.

Measured, 3 alternating runs each on a loaded machine, medians: `buildPath` with
one query key −1.2 %, three query keys +0.3 %, three path params −3.5 %. No
regression; the deltas sit inside the noise of a non-quiet machine, so this is
"no measurable cost", not a claimed win.
