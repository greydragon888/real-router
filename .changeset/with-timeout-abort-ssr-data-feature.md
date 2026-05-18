---
"@real-router/ssr-data-plugin": minor
---

withTimeout passes AbortSignal to loader for cooperative cancellation (#598)

The `loader` argument signature changes from `() => Promise<T>` to
`({ signal }) => Promise<T>`. The signal aborts synchronously when the
deadline elapses (before the race rejects with `LoaderTimeout`), so loader
I/O honoring the signal — e.g. `fetch(url, { signal })` — is actually
cancelled at the network layer. Optional `options.upstreamSignal` composes
via `AbortSignal.any`, so the loader's signal aborts on whichever happens
first: the deadline OR an upstream client-disconnect.

If `options.upstreamSignal` is already aborted at call time, the loader
is *not* invoked and the timer is *not* started — `withTimeout` rejects
immediately with the upstream's reason.

Breaking on the type level — TS permits passing a parameter-less function
to a callback expecting `{ signal }`, so existing call sites that ignore
the new arg keep working. Cancellation is cooperative — loaders that
don't pass `signal` into their I/O still run to completion (current
behavior preserved).

Requires Node 20.3+ for `AbortSignal.any`.
