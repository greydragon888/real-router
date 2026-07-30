---
"@real-router/navigation-plugin": patch
---

Build `replaceHistoryState`'s URL from the resolved state, and drop the redundant rebuild (#1585)

The record written to history has come from `buildNavigationState` since #1574,
so it carries the resolved channels — `forwardTo` applied, plus whatever a
`forwardState` interceptor (`persistent-params`, `search-schema`) injected into
the query. The URL written beside it was still built from the caller's raw
arguments, which reach the public `buildPath` — and that neither resolves
`forwardTo` nor runs the seam. The two therefore disagreed on exactly the keys
the seam contributes:

```
record  /posts/9?tab=new&sort=date&lang=de
URL     /posts/9?tab=new&sort=date            <- injected key missing
```

and, for a forwarding route, the record said `posts` while the address bar said
`/old`. `navigate` has always kept the pair equal; `replaceHistoryState` was the
only history writer of the five reading the caller's bag instead of a resolved
state.

The same change retires the `makeState` rebuild that followed
`buildNavigationState`. It produced a byte-identical state — a leftover from
`buildState`, which built no path of its own — and cost a third trip through the
`buildPath` interceptor chain per history record. Two remain by construction.
