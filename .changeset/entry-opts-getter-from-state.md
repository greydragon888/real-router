---
"@real-router/core": patch
---

Announce a navigation from the state the router is on when a getter of its `opts` navigates (#2786)

`navigate()` now reads the caller's `opts` — accessors included, `signal` among them — before it reads the state it navigates from. A navigation such a getter starts synchronously has then committed, or is in flight and is superseded as usual, and the outer navigation is announced and committed from where the router is: `START a<-c`, `SUCCESS a<-c` after a getter navigated to `c`. Before, it reported the state read before the getter ran — `START a<-home`, `SUCCESS a<-home` with the router on `c`.

A getter that navigates to the outer call's own target now makes that call reject `SAME_STATES`, as navigating to the current state does. A getter that throws still rejects the call with its error and announces nothing.
