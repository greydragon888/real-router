---
"@real-router/core": patch
---

A cancelled navigation stops asking guards, for every cancellation source ([#1687](https://github.com/greydragon888/real-router/issues/1687))

An `opts.signal` aborted while a navigation was in flight reached the FSM and rejected `navigate()`, but did **not** stop that navigation's own guard walk: activation guards kept being asked for a decision after the router had already announced `TRANSITION_CANCEL`. A guard that reads its `AbortSignal` saw `aborted === true` and could bail out; one that does not — an ordinary `canActivate` doing a bare `fetch(url)`, or one with a side effect — ran to completion for a navigation that was over.

The liveness fence at the head of each guard step asked two questions, and the external signal is the only source that passes both:

| cancellation source                | still the navigation in flight? | router active?        | signal aborted?            |
| ---------------------------------- | ------------------------------- | --------------------- | -------------------------- |
| superseded by a newer `navigate()` | **no** — stopped here           | yes                   | —                          |
| `stop()`                           | yes                             | **no** — stopped here | —                          |
| `dispose()`                        | **no**                          | **no**                | —                          |
| external `opts.signal`             | yes                             | yes                   | **the only discriminator** |

`CANCEL` deliberately carries no `update`, so the navigation is still the one the machine names on the way out, and it lands the machine in `READY`, which is active. The fence now also reads the signal — the same three terms the asynchronous half of the pipeline has always asked — so the walk stops on every source, on the deactivate phase, on the activate phase (including later segments), and on a navigation parked in an async guard.

**Unchanged, deliberately:** `subscribeLeave` listeners still fire after a cancellation, with `signal.aborted === true`. A leave listener is documented to fire when the departure is approved and to receive a signal that aborts on cancellation — being called so it can wind down is its contract, not a leak. Only guards are stopped.
