---
"@real-router/core": patch
---

fix(core): say what removing a route mid-navigation actually does ([#1756](https://github.com/greydragon888/real-router/issues/1756))

`getRoutesApi(router).remove(name)` during a navigation warned that it "may cause unexpected behavior" and left it there. The caller then got a bare `"CANCELLED"` from a `navigate()` they had no reason to connect to their own `remove()`. The warning now names the mechanism:

> Route "admin" removed while navigation is in progress. Removing a route the router is navigating to (or an ancestor of it) fails that navigation. The rejected navigate() promise carries `"CANCELLED"` while the guard walk is synchronous and `"ROUTE_NOT_FOUND"` once it has gone async; `onTransitionError` always reports `"ROUTE_NOT_FOUND"`, and `onTransitionCancel` never fires. The committed state is not affected either way.

The two codes are a **channel** split, not only an arc split, and that is measured: on the synchronous arc one failure carries `"CANCELLED"` on the rejected promise and `"ROUTE_NOT_FOUND"` on `onTransitionError`. So the hook is the stable predicate of the two, and the message says which is which rather than naming the arcs and appending the hook — a form that reads as "the hook carries these codes" and is false on exactly the arc it is most likely to be read on.

**No behaviour changed, and that is the finding.** #1756 reported the removal guard as asymmetric — it refuses the route you are standing on, but allows the route you are navigating to, and allows it only while in flight. Measured, the asymmetry is one coherent rule applied twice: the guard protects the **committed** state. Removing the route you are on would leave `getState().name` naming a route that no longer exists; removing the route you are heading for would not, and the commit door cancels that navigation instead. ⚠ Scope of that claim, measured: it holds for a well-formed tree. Under flat dotted names (a route literally named `"a.b"` declared beside `"a"` rather than as its child — #1194, closed but still reproducing) the commit door asks only about the terminal, so removing the ancestor lets the navigation commit with `transition.segments.activated` naming a route `has()` denies.

Six late windows were measured — a synchronous activation guard, an async one, a `canDeactivate` guard, `subscribeLeave`, `onTransitionStart`, `onTransitionLeaveApprove` — and in every one the committed state still named a live route. All six are now pinned.

**Refusing the second case was measured HARMFUL and is now pinned against.** With the removal refused, the guard returns `true`, the navigation completes into the route the application was revoking, and the route stays in the tree:

| a guard revokes its own section | navigation   | committed     | section         |
| ------------------------------- | ------------ | ------------- | --------------- |
| today                           | cancelled    | `home`        | removed         |
| with the proposed guard         | **resolves** | `admin.panel` | **still there** |

So the app's revocation silently does not happen and the user lands exactly where it was keeping them out of. Two tests red if that guard is ever added — the third in the block is the CONTROL, and a control that reds is not a control.
