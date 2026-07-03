# subscribe probes — 2026-07-03

Run: `cd benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx core/audit-probes/subscribe-2026-07-03/<probe>.ts` (src); without `--conditions` — dist.

Full report: `packages/core/.claude/audit/subscribe-deep-2026-07-03.md`. Latency re-run of the 2026-05-22 set (probe-01..06 there) was `[SKIPPED: battery]` — emit path changed since (#1033 `#dispatching` set), re-measure on AC.

| Probe | Question | Verdict |
|---|---|---|
| 01 | fire-condition matrix: start / reject-codes / navigateToNotFound / **replace() revalidation #950 (both arms)** / clear() | all confirmed: fires on start (prev=undefined), on navigateToNotFound, on replace-revalidate AND replace-drop→UNKNOWN_ROUTE; NO fire on SAME_STATES / ROUTE_NOT_FOUND / CANNOT_ACTIVATE rejects; clear() silent |
| 02 | reentrancy + isolation (#1030/#1033/#944) | sync reentrant navigate from listener → REENTRANT_NAVIGATION thrown sync, isolated via onListenerError, other listeners run, outer navigate commits; deferred (microtask) navigate allowed; async listener rejection → 0 unhandledRejection; mid-emit: added listener NOT in current cycle, removed listener STILL runs (snapshot); dispose() mid-emit → both listeners run, navigate resolves, router disposed after |
| 03 | payload + limits | payload `{route, previousRoute}` is per-listener (no cross-listener leak) and **NOT frozen** (asymmetric with subscribeLeave's frozen shared payload — by-design trade-off, wrapper mutation is listener-local; already pinned by `subscribe.properties.ts:118-146`); `route` deep-frozen. Hard-cap (`options.limits.maxListeners`) throw is a **bare `Error` (no RouterError code) leaking the internal event name `"$$success"`** into a user-facing message |
| 04 | NO_FIRE for the two uncovered reject codes | confirmed correct: supersede → cancelled navigation does NOT fire (only the winner does); blocking `canDeactivate` (CANNOT_DEACTIVATE) → no fire. Pure test-gaps — scenarios here are ready to become the missing its |
