---
"@real-router/memory-plugin": patch
---

Fix lifecycle race between `stop()`/`teardown()` and in-flight `#go()` (#505)

Before this fix, calling `router.stop()` or `unsubscribe()` while a
`back()` / `forward()` / `go(delta)` navigation was still in flight
could leave plugin state desynchronised.

**Root cause.** `#go(delta)` updates `#index` optimistically (synchronously)
and reverts it in the reject-handler of the navigation promise. The
revert is guarded by the `#goGeneration` counter, so a second `#go` that
bumps the generation protects its own optimistic update from a stale
settler. But `onStop` and `teardown` did **not** bump the counter, so a
settler whose generation was captured before the lifecycle change still
observed a match and wrote into already-cleared state:

```
router.back();    // #go: #index = 1 (optimistic), navigate("a") in flight
router.stop();    // #clear(): #entries = [], #index = -1

// navigate() rejects after stop
// reject-handler sees #goGeneration === generation → runs revert
// → this.#index = previousIndex (= 2)
// Result: #index = 2, #entries.length = 0 — desynced
```

A separate flow-on bug: `#clear()` did not reset `#navigatingFromHistory`
or `#pendingDirection`, so the flag remained `true` after a stop/start
cycle and the next `onTransitionSuccess` took the history-restore branch,
silently skipping the `push` of a new entry.

**Fix.** Two coordinated changes in `src/plugin.ts`:

1. **`onStop` and `teardown` bump `#goGeneration`** — in-flight settlers
   see a mismatch and skip both the revert and the `#navigatingFromHistory
   = false` reset. Mirrors the existing generation-guard pattern used
   between consecutive `#go` calls.
2. **`#clear()` resets transient `#go` state** — `#navigatingFromHistory =
   false` and `#pendingDirection = "navigate"` so the next lifecycle
   starts clean regardless of whether a settler ran.

Together these cover both `stop()`/`start()` cycles (HMR, test harnesses)
and `unsubscribe()` called mid-navigation. Variant (2) from the issue
(dispose-check in settlers) is **not** needed — generation bump covers
both lifecycle paths, where variant (2) would only catch `teardown`.

**Regression tests.** Three new functional tests in
`tests/functional/plugin.test.ts` under
`describe("lifecycle race with in-flight #go (#505)")`:

- `stop() mid-flight leaves history empty and next navigation records
  entry` — exercises both invariants: post-stop geometry is zeroed, and
  the re-start + navigate sequence actually pushes. Fails without either
  half of the fix.
- `unsubscribe() mid-flight does not desync #index against cleared
  entries` — same race for the `teardown` path.
- `stop() → start() cycle leaves #navigatingFromHistory false even with
  no in-flight #go` — sanity check that `#clear()`'s new resets do not
  regress the normal lifecycle.

Existing stress S3 (`teardown-mid-nav.stress.ts`) continues to pass.

No public API changes.
