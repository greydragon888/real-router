---
"@real-router/core": patch
---

The navigation owns its `AbortController`, so a cancelled one aborts the leave signal on both arcs (#1684)

`subscribeLeave` documents one contract for its `signal`: it aborts when the
navigation is cancelled or fails, never when it succeeds, and — in core's own
words — "this holds identically on the guard and no-guards pipeline paths". On
the no-guards path it did not.

The controller lived in a router-level slot (`InFlightNavigation`), while the
machine held the navigation itself. Two owners for one fact, kept in step by
hand, and the slot was released as a SUCCESS before the commit. On the
guard-free leave arc that controller was local to `handleNoGuardsLeave` and
therefore invisible to the failure handler, so a navigation that rejected
`TRANSITION_CANCELLED` handed its listener a signal that never aborted:

```ts
const external = new AbortController();

await router.start("/a");

// No guard on the walked path — this is the arc that was broken.
router.subscribeLeave(({ signal }) => {
  external.abort();
  // `signal.aborted` stayed false for the rest of this navigation,
  // even though navigate() below rejects CANCELLED.
});

await router.navigate("b", {}, undefined, { signal: external.signal });
```

The slot is gone. The controller is a field of the navigation
(`NavigationContext.controller`), which the machine already carries as
`ctx.inflight`, so ownership is transitive: the FSM `CANCEL` action reaches the
controller by identity, and nothing has to null anything on the way out. Success
still never aborts — there is no release left to get wrong, the controller
simply dies with the navigation.

#1197 closed the ASYNC half of this same arc; this is its synchronous twin.

Internally this removes a concept rather than adding one: `InFlightNavigation`
(88 lines) and its DI wiring through four files — `EventBusOptions.abortController`,
the closure in `Router.ts`, `NavigationNamespace.abortCurrentController` — plus
the `inFlight` parameter threaded through every function in the transition
pipeline. Allocation behaviour is unchanged and still pinned by
`controller-allocation.test.ts`: the controller is created on the same two sites
under the same two conditions.
