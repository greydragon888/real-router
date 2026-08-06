---
"@real-router/core": patch
---

The external-signal bridge is registered only when something in the band can abort ([#1690](https://github.com/greydragon888/real-router/issues/1690))

Passing `opts.signal` to `navigate()` used to attach a listener to the caller's signal on every navigation, from before the announce. The listener routes an abort onto FSM `CANCEL` ([#1684](https://github.com/greydragon888/real-router/issues/1684)) — but it can only ever fire while application code is running between the announce and the commit, and exactly three things put code there: a pre-commit plugin hook (`onTransitionStart` / `onTransitionLeaveApprove`), the `subscribeLeave` dispatch, and a guard on the path. With none of them the navigation runs to completion without yielding, so the listener was attached and detached having never had a chance to fire.

**Measured**: a signal used to add **363 ns** to such a navigation and now adds **20 ns** — 1095 → 765 ns per navigation on the guard-free arm, alternating processes, four rounds.

The decision is per PATH, not per router: a router with a guard on one route still skips the bridge for navigations that do not walk it. In a two-route loop over a guarded and an unguarded target, registrations drop from 100 to 50 per 100 navigations.

The main beneficiary is `@real-router/navigation-plugin`, the one consumer in the ecosystem that passes a signal — the Navigation API hands it a fresh `NavigateEvent.signal` for **every** intercepted navigation, guarded or not.

Two of the three conditions are knowable before the announce; `hasGuards` is not, because a `TRANSITION_START` listener may still register one. So the bridge has two moments: early when either of the first two holds, and late — after the walk is planned — when only guards remain. The late moment is in time precisely because the first two were false, so nothing ran during the announce.

⚠ Deferring a registration is not the same as the window being empty, and the difference is that `addEventListener` never fires retroactively. The late moment therefore carries its own already-aborted check — the same one `finishAsyncNavigation` keeps at its entry, for the same reason. Without it, an abort arriving from a Proxy-backed `opts` getter (a supported shape: reading `opts` is a call into application code) produced no `TRANSITION_CANCEL` and left the band in `LEAVE_APPROVED`.

Two supporting changes fall out of the same fact. `opts.forceDeactivate` is now read once at the entry beside `opts.signal`, instead of inside the pipeline after the announce; and `finishAsyncNavigation` reads the signal the bridge was attached to rather than re-reading `opts.signal`, which with a Proxy could hand back a different object.
