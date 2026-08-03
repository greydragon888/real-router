---
"@real-router/core": minor
---

`replace()` revalidation no longer asks `canDeactivate` — and no longer evicts to 404 on its refusal (#1652)

When `getRoutesApi(router).replace(routes)` left the user's URL owned by a
**different** route, the revalidation consulted `canNavigateTo`, which collapses
two opposite questions into one boolean — "can you ENTER the new route" and "can
you LEAVE the current one" — and routed every `false` to `navigateToNotFound`.

That reading is right for the first and exactly backwards for the second. A
`canDeactivate` saying "do not leave" was answered by eviction to
`UNKNOWN_ROUTE`, which is the worst outcome available and the very thing the
guard exists to prevent. Measured on the four-cell matrix: with **no**
`canDeactivate` the user landed on the new route; with a **refusing** one, on
`UNKNOWN_ROUTE`. A guard that could not be honoured was making the result worse
than no guard at all.

The arm now consults the **activation** half only, which is the half it can
honour. Two consequences:

- A refusing `canDeactivate` no longer changes the outcome of a tree swap — the
  user lands wherever they would have landed without it.
- The activation guards are now always evaluated. The deactivation refusal used
  to short-circuit before them, so "may the user be on the new route" went
  unasked.

**This is a subtraction, not a new mechanism.** The other two revalidation arms
already declined to consult `canDeactivate`, each with its reason — survivor:
the user was legitimately here (#1201); vanished route: the route whose guard
would speak no longer exists. Route-identity change was the odd one out; all
three now agree.

Migration: if you relied on a `canDeactivate` guard to protect unsaved work
across a `replace()`, that protection never worked — it produced a 404 rather
than keeping the user. **Check for unsaved work before calling `replace()`.** A
tree swap is an operation your application performs, not a departure the user
chose, and the router does not veto its own API on a route guard's behalf.

Unchanged: `navigate`, `navigateToState` and the public `navigateToNotFound`
(#1643) all still ask and still refuse — user-initiated departures are exactly
where the guard has a "stay" branch to offer.

Closes #1652
