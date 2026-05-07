/**
 * Typed loader errors that SSR pipelines translate into HTTP semantics.
 *
 * The `ssr-data-plugin` and `rsc-server-plugin` are intentionally
 * HTTP-agnostic — they only await the loader and write the resolved value
 * to `state.context.<namespace>`. Loaders bridge to HTTP status codes by
 * throwing one of these named errors; application-layer middleware catches
 * them and maps each `code` to the right status (302/308, 404, 504).
 *
 * Structural discrimination via `code` (not `instanceof`) so consumers
 * can match across realms / bundle boundaries without coupling to the
 * class identity.
 *
 * Re-exported from both plugins under the `./errors` subpath:
 * `@real-router/ssr-data-plugin/errors` and
 * `@real-router/rsc-server-plugin/errors`.
 */

export class LoaderRedirect extends Error {
  readonly code = "LOADER_REDIRECT";

  constructor(
    readonly target: string,
    readonly status: 301 | 302 | 307 | 308 = 302,
  ) {
    super(`Redirect to ${target}`);
    this.name = "LoaderRedirect";
  }
}

export class LoaderNotFound extends Error {
  readonly code = "LOADER_NOT_FOUND";

  constructor(readonly resource: string) {
    super(`Resource not found: ${resource}`);
    this.name = "LoaderNotFound";
  }
}

export class LoaderTimeout extends Error {
  readonly code = "LOADER_TIMEOUT";

  constructor(
    readonly route: string,
    readonly ms: number,
  ) {
    super(`Loader for "${route}" exceeded ${ms}ms`);
    this.name = "LoaderTimeout";
  }
}

/**
 * Race a loader against a deadline, with cooperative cancellation.
 *
 * The loader is invoked with `{ signal }` — a composed `AbortSignal` that
 * aborts on the first of:
 * - the deadline elapsing (`internalController.abort()` fires synchronously
 *   *before* the race rejects with `LoaderTimeout`, so a loader that
 *   threads `signal` into its I/O — e.g. `fetch(url, { signal })` — can
 *   actually cancel the underlying work);
 * - `options.upstreamSignal` aborting (typically the request-scoped abort
 *   wired by `cloneRouter(base, { abortSignal })` for client-disconnect).
 *
 * Composition uses `AbortSignal.any([upstream, internal])` (Node 20.3+).
 * If `upstreamSignal` is already aborted at call time, the loader is *not*
 * invoked and the timer is *not* started — the rejection mirrors
 * `upstreamSignal.reason ?? new DOMException("Aborted", "AbortError")`.
 *
 * On deadline, the same `LoaderTimeout` instance is used as both the
 * `signal.reason` and the rejection reason — they refer to one object.
 * On upstream abort during execution, the race rejects with the loader's
 * own error (typically `AbortError`), *not* `LoaderTimeout`.
 *
 * Cancellation is cooperative: loaders that don't propagate `signal` into
 * their I/O still run to completion in the background — the race result
 * is unaffected, but resources are not freed early.
 *
 * The `setTimeout` handle is cleared via `.finally()` on the work promise
 * so a fast-path success doesn't leak it. `Promise.race`'s internal
 * `Promise.resolve(p).then(resolve, reject)` consumes any late losing
 * rejection — no `unhandledRejection` for late loader settlements.
 *
 * Requires Node 20.3+ for `AbortSignal.any`.
 */
export function withTimeout<T>(
  routeName: string,
  ms: number,
  loader: (deps: { signal: AbortSignal }) => Promise<T>,
  options?: { upstreamSignal?: AbortSignal | null },
): Promise<T> {
  const upstream = options?.upstreamSignal;

  if (upstream?.aborted) {
    // `signal.reason` is normally set automatically by the spec
    // (`controller.abort()` without an argument yields a `DOMException`),
    // but the field is writable, so we fall back to a fresh `AbortError`
    // if some caller produced an aborted signal with `reason === undefined`.
    return Promise.reject(
      upstream.reason ??
        new DOMException("The operation was aborted.", "AbortError"),
    );
  }

  const internal = new AbortController();
  const composed = upstream
    ? AbortSignal.any([upstream, internal.signal])
    : internal.signal;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      const error = new LoaderTimeout(routeName, ms);
      internal.abort(error);
      reject(error);
    }, ms);
  });

  const work = (async () => loader({ signal: composed }))().finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  return Promise.race<T>([work, timeoutPromise]);
}
