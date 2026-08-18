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

⚠ Collapsing the gate-then-value pair inside `mergeDefined` — the site #1812
names — does **not** fix it: applied as a mutation the count stays at 2. The two
reads are in different functions.

**Fixed by deletion, not addition.** The path channel never had the defect
because it has always arrived normalised, so the query channel is routed through
the same normaliser and handed over as owned. That makes `mergeWithDefault`'s
unowned branch unreachable from every call site, so the branch and its
`valueIsOwned` parameter are gone.

`normalizeParams` becomes `normalizeChannel(bag, empty)` — one implementation for
both channels, taking the empty singleton as a parameter because `EMPTY_PARAMS`
and `EMPTY_SEARCH` are distinct frozen objects compared by identity. Four doors
were affected and all four now read once: `navigate`, `buildPath`,
`isActiveRoute` and `makeState`, pinned by the read-count table.

Measured, 3 alternating runs each on a loaded machine, medians: `buildPath` with
one query key −1.2 %, three query keys +0.3 %, three path params −3.5 %. No
regression; the deltas sit inside the noise of a non-quiet machine, so this is
"no measurable cost", not a claimed win.
