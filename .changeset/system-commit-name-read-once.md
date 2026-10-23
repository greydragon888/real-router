---
"@real-router/core": patch
---

Commit the route name `getInternals(router).systemCommit` checked, not a second read of it (#2786)

`systemCommit(toState, fromState, opts)` read `toState.name` once to check it against the route table and again to build the committed state. A `State` whose `name` answers differently on the second read — an accessor- or Proxy-backed object built outside core — committed a name the check never saw: a route the table does not hold, or another route's name over this state's path.

- The door reads `name` once, and the committed state carries the name the check accepted.
- A name the table does not hold on that read is still refused with `ROUTE_NOT_FOUND`, and a plain `State` commits as before.
