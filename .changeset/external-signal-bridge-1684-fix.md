---
"@real-router/core": patch
---

An external `opts.signal` aborted from inside a navigation now reaches the FSM on every arc (#1684)

`router.navigate(name, params, search, { signal })` promises that aborting the
signal cancels the navigation. It did — as far as the CALLER could see: the
promise rejected `TRANSITION_CANCELLED`. The router itself was never told.

The bridge from the caller's signal onto FSM `CANCEL` was registered inside
`finishAsyncNavigation`, so it existed only for a navigation that PARKED on an
async guard or leave listener. Anything that aborted before that reached nobody:
the abort was seen only by the commit gate, which refuses the transition without
moving the machine, and the resulting cancellation is filtered before any event
is sent. Three consequences, in that window:

- **no `TRANSITION_CANCEL` was emitted at all** — a plugin's `onTransitionCancel`
  never fired, so loggers and adapter error-UIs saw a navigation that started and
  then silently stopped existing;
- **`isLeaveApproved()` returned `true`** after `await navigate(...)` had already
  rejected;
- **`replace(routes)` was a silent no-op** — whole-tree swaps are blocked while a
  transition is in flight, and the band never left it. The caller got no
  exception and no new tree.

The window closed on the next navigation, so this was bounded rather than a
permanent wedge — but inside it the router lied about its own phase and dropped a
tree swap on the floor.

```ts
await router.start("/a");

const external = new AbortController();

router.subscribeLeave(() => {
  external.abort(); // synchronous, from inside the navigation
});

await router.navigate("b", {}, undefined, { signal: external.signal })
  .catch(() => undefined);

router.isLeaveApproved(); // was: true   — now: false
getRoutesApi(router).replace([...]); // was: silently dropped — now: applied
// onTransitionCancel: was never called — now called exactly once
```

⚠ **"Synchronous navigation" was the wrong description of the affected shape.**
What decides it is whether the abort lands before the bridge is registered. A
guard-free route with an *async* `subscribeLeave` listener is on the asynchronous
arc and was affected all the same, because its listeners are dispatched before
the promise they return hands the navigation on.

The bridge is now registered for every navigation carrying a signal, from before
the transition is announced — which also covers an abort from a plugin's
`onTransitionStart`. It is detached when the navigation settles: the signal
belongs to the application and outlives the navigation, so a retained listener
would let a later abort cancel an unrelated one.

Affected entry points, all now cancelling through the machine: a synchronous
`subscribeLeave` listener, a plugin's `onTransitionStart` or
`onTransitionLeaveApprove`, and the body of a `canActivate` / `canDeactivate`
guard aborting its own controller — the documented cooperative-cancellation
pattern. It reproduces through `getPluginApi().navigateToState` too, the
primitive URL plugins call from popstate handlers.

An already-aborted signal is still refused before the navigation is announced,
unchanged: nothing was announced, so no terminal event is owed.

**Cost, measured rather than argued.** The uninterruptible fast path is
untouched: a navigation carrying a signal is *suspendable* by definition, so it
never reaches this code, and no additional `AbortController` is allocated
anywhere. A navigation that DOES carry a signal now pays two `EventTarget`
operations on it — `addEventListener` before the announce, `removeEventListener`
when it settles — which is **≈ +390 ns per navigation** (≈ 790 → ≈ 1180 ns,
same-session A/B against the base commit on the `navigate/external-signal`
arm). Before this fix such a navigation registered nothing on the caller's
signal when it ran synchronously, and that is exactly what the defect was.
