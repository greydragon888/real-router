# event-bus probes — 2026-07-03

Run: `cd benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx core/audit-probes/event-bus-2026-07-03/<probe>.ts` (src); without `--conditions` — dist. All three new probes ran against BOTH — identical verdicts.

Baseline set `event-bus-2026-05-22/` re-run against current src the same day: probe-04 behavioural part / 07 / 07b / 08 / 09 — healthy. Two baseline probes carry STALE artifacts (not src defects): probe-04 prints false "missing DISPOSE transitions" from a hardcoded pre-#669 copy of the FSM table (routerFSM.ts has had them since a80ef226); probe-09's "should still be in STARTING per start audit Bug #1" comment predates #670, and its `start("/nonexistent")` observation is a SUCCESSFUL not-found start (`allowNotFound` defaults to `true` — verified: default → resolved:UNKNOWN_ROUTE/isActive=true; `allowNotFound:false` → rejected:ROUTE_NOT_FOUND/isActive=false/state=undefined, per the CLAUDE.md pre-commit-unwind contract). probe-05/06 (latency) — `[SKIPPED: battery]`.

Full report: `packages/core/.claude/audit/event-bus-deep-2026-07-03.md`.

| Probe | Question | Verdict |
|---|---|---|
| 10 | TREE_CHANGED channel vs dispose (#717/#982/#1034) | confirmed: listener released on dispose (no post-dispose fires); late `subscribeChanges` throws ROUTER_DISPOSED both direct and via pre-bound ref |
| 11a | does the reentrant-navigate ban (#1030) hold inside EVERY transition-event dispatch window? | confirmed for all five: START / SUCCESS / ERROR / LEAVE_APPROVE / CANCEL → REENTRANT_NAVIGATION (isProcessing covers every emitTransition* method) |
| 11b | external `opts.signal` abort reason threading (#943) | confirmed: `signal.reason` of the subscribeLeave payload carries the external reason ("external-reason-42"); navigate rejects CANCELLED |
| 12 | baseline leftover #6: thenable thrown by a guard | CLOSED — `"then"` filtered by reservedRouterErrorProps (errorHandling.ts:92); RouterError not thenable, non-reserved props still copied |
