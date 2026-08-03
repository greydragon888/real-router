---
"@real-router/core": minor
---

`navigateToNotFound` asks `canDeactivate` before leaving (#1643)

A `canDeactivate` guard blocked `navigate()` and did not block
`navigateToNotFound()`, which was never asked at all — the one departure the
guard could not see, and the guard exists to stop exactly this.

It mattered because the primitive is not exotic: the shipped URL plugins call it
whenever the browser hands them a URL that no longer matches a route. So the
user journey was ordinary — an editor with unsaved changes, press Back, land on
a URL whose route was removed — and the confirm dialog the app registered never
appeared. The state was gone with no event the app could veto.

Now the current route's `canDeactivate` guards are consulted. A refusal throws
`RouterError(CANNOT_DEACTIVATE)`, emits `TRANSITION_ERROR` and leaves the
committed state untouched. That is what the surrounding handlers already expect:
the matched-route branch beside it rejects on a blocking guard and its `catch`
rolls the URL back, and the strict-mode branch throws for the same purpose — the
`allowNotFound` branch was the only one that could not refuse, and that asymmetry
was the defect. No plugin change is needed.

**An async guard resolves to refuse.** A synchronous primitive returning a
`State` cannot await one, and for a guard whose job is preventing loss "cannot
ask" has to mean "do not leave". This mirrors `canNavigateTo`, which resolves an
async guard to `false` for the same reason. If you rely on `navigateToNotFound`
committing while an async `canDeactivate` is registered on the current route, it
will now throw — make the guard synchronous, or catch the refusal.

Unchanged: `start()` with `allowNotFound` (nothing is committed yet, so the
consult short-circuits), a router with no `canDeactivate` guards at all, and
`replace()`'s revalidation, which opts out on EVERY arm (#1652, same PR): a tree
swap is an operation the application performed, not a departure the user chose,
and it has no "stay" branch to offer — after the swap the old route may not
exist, or may live at another path.

Related to #524, which was this contract broken one layer up, in
`navigation-plugin`'s `forceDeactivate` default. That fix restored confirm-on-back
only on the arc where the URL still matches a route; this closes the other one.
