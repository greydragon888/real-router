---
"@real-router/core": patch
---

fix(core): the boot window degrades instead of failing the start ([#1750](https://github.com/greydragon888/real-router/issues/1750))

`start()` has two windows in which it is in flight and `isTransitioning()` is `false`, so no route-CRUD gate fires: inside an async `start` interceptor, and from a plugin's `onStart`. A destructive mutation applies in both — and only one of them handled the consequence.

```ts
router.usePlugin(() => ({ onStart: () => { getRoutesApi(router).clear(); } }));

await router.start("/a");
// before: rejects ROUTE_NOT_FOUND even with allowNotFound: true
// after:  resolves into UNKNOWN_ROUTE, exactly as the interceptor window already did
```

`matchPath` runs **before** `completeStart()`, and `completeStart()` is what opens the second window. So a wipe in the first leaves no match and the `allowNotFound` branch takes over — that arm has always degraded. In the second, `matchedState` survives as a stale object, `navigateToState` fails on it, and `allowNotFound` never got a say.

**Degrade, not gate** — the owner's decision, and the same answer the router already gives elsewhere: the mutation the application asked for applies, and the boot reports the consequence through the channel the caller already handles. Under `allowNotFound` that is `UNKNOWN_ROUTE`, exactly as when a URL matches nothing and exactly what `replace()` does on a running router when it drops the route the user is on (#950 / #1201). Without `allowNotFound` both windows still reject `ROUTE_NOT_FOUND` — there is nothing to degrade into, and the option the caller already chose decides.

The catch is narrow on both runtime terms: only `ROUTE_NOT_FOUND`, only under `allowNotFound`. A guard the window installs on the route being booted still refuses the boot (`CANNOT_ACTIVATE`) — an application's own decision is honoured, not silently degraded into a 404. #1204's mid-`STARTING` pin is untouched: it swaps in a tree that matches, so no failure reaches the fallback.

⚠ **The state settles alike across the windows; the event stream does not.** Window 1 has no match to commit, so only `TRANSITION_SUCCESS` fires. Windows 2 and 3 commit a stale match first, so the failure is ANNOUNCED before the recovery — a plugin logging `onTransitionError` sees a `ROUTE_NOT_FOUND` the router then recovered from. Suppressing that emit means reaching inside the navigation pipeline, which is wider than this fix, so it is pinned as a known boundary instead.

The 404 keeps the URL the caller started with, not the rebuilt one — the two differ whenever the match rewrites the path (a `forwardTo`, a `defaultParams` fill), and the fallback matches what the no-match branch beside it already does.
