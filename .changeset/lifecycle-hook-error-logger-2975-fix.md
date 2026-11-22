---
"@real-router/lifecycle-plugin": minor
---

A hook's error goes to the router's logger, and the plugin reads the load a hook returns (#2975)

A hook that throws — its body or its factory — and the rejection of a thenable
the hook returns go to the router's `logger.error`, under the context
`lifecycle-plugin`. Neither ends a Node process any more: the throw was
re-thrown on a microtask, an uncaught exception, and the promise of an `async`
hook was dropped, an unhandled rejection. Each hook stays isolated, so a
failing hook does not stop a later hook of the same navigation.

A rejection with the reason of the hook's own `signal`, or with that reason as
its `cause`, is the hook's own abort and is not logged: `fetch` rejects with
the reason, and `setTimeout` of `node:timers/promises` and `events.once` with
the reason as `cause`. An abort error a client makes of its own is logged —
axios rejects with its `CanceledError`.

**Breaking Change:**

- `LifecycleHook` returns `void | PromiseLike<unknown>`: a hook returns its
  load, or nothing. A hook whose expression body returns a value that is not a
  thenable no longer type-checks — write it as a block:

  ```diff
  - onEnter: () => (toState) => cache.set(toState.name, Date.now()),
  + onEnter: () => (toState) => {
  +   cache.set(toState.name, Date.now());
  + },
  ```

- A hook's error no longer reaches a global handler — `window`'s `error` and
  `unhandledrejection` events, Node's `uncaughtException` and
  `unhandledRejection`. An error tracker that listens there receives it from
  the router's `logger.callback` instead, with `callbackIgnoresLevel: true`
  under `level: "none"`.
- Return the load from the hook — `return loadServices(toState.search, { signal })` —
  so that its failure reaches the logger. A load the hook starts without
  returning it is the application's to handle. A returned load whose client
  rejects an abort with an error of its own is logged whenever the hook's
  `signal` aborts; catch that error in the hook — for axios,
  `.catch((error) => { if (!axios.isCancel(error)) throw error; })`.
