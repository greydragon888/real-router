---
"@real-router/core": patch
---

`start()` no longer leaks an unhandledRejection when called twice without `await` (#1605)

`Router.start()` attached its fire-and-forget suppressor at the BOTTOM of the
method, below an early `return Promise.reject(CACHED_ALREADY_STARTED_ERROR)`. So
the one rejection that leaves `start()` first was the one nothing covered: a
second, unawaited `start()` raised an `unhandledRejection`, which under Node
22+'s default `--unhandled-rejections=throw` **terminates the process** — with a
stack pointing at the cached error's module constant rather than at the caller.
`canStart()` is also false during `STARTING`, so this covered two _concurrent_
`start()` calls, not only sequential ones — the shape a double mount, a React
StrictMode double effect, or an HMR reload produces.

It was the only uncovered rejection site in the package: the seven in
`NavigationNamespace` go through its `#settle` checkpoint, the three cached
rejection singletons carry a module-load `.catch()`, and the remaining two in
`Router.start()` land in `internalStart`, which already had two handlers.

Fixed the way the navigate family was fixed — **one checkpoint per public
method** rather than a `.catch()` remembered at each `return` site, because a
remembered one can be forgotten and a forgotten one is invisible until it leaks.
`start()` is now a wrapper that suppresses whatever `#start()` returns, so no
future early return can reopen the hole.

`ROUTER_ALREADY_STARTED` joins `SUPPRESSED_ERROR_CODES`, so the safety net stays
silent for it: calling `start()` twice reports "already done", exactly as
`SAME_STATES` does for `navigate()`, and reporting a caller's own no-op as an
internal fault would be the wrong answer. Awaiting callers are unaffected —
`start()` still rejects with `ROUTER_ALREADY_STARTED`. Nothing changes on the
navigation side; `navigate()` cannot produce that code.
