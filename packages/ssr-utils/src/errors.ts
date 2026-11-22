/**
 * Typed loader errors that an SSR handler translates into HTTP statuses, and
 * `withTimeout`, which rejects with one of them.
 *
 * The SSR loader plugins are HTTP-agnostic: they await the loader and write
 * its value to `state.context.<namespace>`. A loader reaches an HTTP status by
 * throwing one of these errors, and the application's handler maps the error's
 * `code` to a status — a redirect, 404, 504.
 *
 * `code` is the discriminator. `instanceof` holds as well, for an error from
 * another copy of this package and from its other build, ESM or CJS: every
 * instance carries the `LOADER_ERROR` mark, and `instanceof` against a class
 * of the family admits a value that carries its mark, besides what the
 * prototype chain admits.
 *
 * `@real-router/ssr-data-plugin/errors` and
 * `@real-router/rsc-server-plugin/errors` re-export these names.
 */

/** Captured at module load, like the intrinsics this package decides with. */
const defineProperty = Object.defineProperty;
const ordinaryHasInstance = Function.prototype[Symbol.hasInstance];

/**
 * The mark of a loader error. Its value is the error's `code`.
 *
 * ⚑ `Symbol.for` gives every copy of this package that one thread loads the
 * same symbol, so the key string and the three values are the contract between
 * versions: a copy that spells either differently does not recognise this
 * copy's errors. `tests/functional/errors.test.ts` pins both as literals.
 */
const LOADER_ERROR = Symbol.for("@real-router/ssr-utils/loader-error");

type LoaderErrorCode =
  "LOADER_REDIRECT" | "LOADER_NOT_FOUND" | "LOADER_TIMEOUT";

/**
 * `Symbol.hasInstance` of a class of the family. It admits what the prototype
 * chain admits, and on the class itself a value that carries the class's mark
 * as well. A subclass reads the chain alone, so it does not admit an instance
 * of the class it extends.
 */
function isInstance(
  family: abstract new (...args: never[]) => Error,
  receiver: unknown,
  value: unknown,
  code: LoaderErrorCode,
): boolean {
  if (ordinaryHasInstance.call(receiver, value)) {
    return true;
  }

  return (
    receiver === family &&
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[LOADER_ERROR] === code
  );
}

/* eslint-disable unicorn/class-reference-in-static-methods -- `this` is the
   class `instanceof` was asked about, a subclass included; the comparison with
   the class itself is what `isInstance` decides on. */

export class LoaderRedirect extends Error {
  readonly code = "LOADER_REDIRECT";

  constructor(
    readonly target: string,
    readonly status: 301 | 302 | 307 | 308 = 302,
  ) {
    super(`Redirect to ${target}`);
    this.name = "LoaderRedirect";
    defineProperty(this, LOADER_ERROR, { value: "LOADER_REDIRECT" });
  }

  static [Symbol.hasInstance](value: unknown): boolean {
    return isInstance(LoaderRedirect, this, value, "LOADER_REDIRECT");
  }
}

export class LoaderNotFound extends Error {
  readonly code = "LOADER_NOT_FOUND";

  constructor(readonly resource: string) {
    super(`Resource not found: ${resource}`);
    this.name = "LoaderNotFound";
    defineProperty(this, LOADER_ERROR, { value: "LOADER_NOT_FOUND" });
  }

  static [Symbol.hasInstance](value: unknown): boolean {
    return isInstance(LoaderNotFound, this, value, "LOADER_NOT_FOUND");
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
    defineProperty(this, LOADER_ERROR, { value: "LOADER_TIMEOUT" });
  }

  static [Symbol.hasInstance](value: unknown): boolean {
    return isInstance(LoaderTimeout, this, value, "LOADER_TIMEOUT");
  }
}

/* eslint-enable unicorn/class-reference-in-static-methods */

/**
 * Races `loader` against a `setTimeout` deadline of `ms`, and rejects with a
 * `LoaderTimeout` when the deadline's timer fires first.
 *
 * `loader` gets `{ signal }`, which aborts when the deadline fires or, given
 * `options.upstreamSignal` (typically the request's, which a loader reads with
 * `getDep("abortSignal")`), when that signal aborts — whichever comes first.
 * The two are joined with `AbortSignal.any` (Node 20.3+).
 * When the deadline aborts `signal`, it does so before it rejects the race,
 * and `signal.reason` and the rejection are one `LoaderTimeout` instance.
 *
 * The race does not listen to `upstreamSignal`: it settles as `loader` does
 * unless the deadline fires first, so an upstream abort reaches it only
 * through a loader that honours `signal` (`fetch(url, { signal })` rejects
 * with the signal's reason). Cancellation is cooperative: a loader that
 * ignores `signal` runs on after the deadline or an upstream abort and frees
 * nothing early.
 *
 * Given an `upstreamSignal` that is already aborted, `withTimeout` rejects at
 * once with its `reason`, or with a `DOMException` named `AbortError` when
 * that reason is `null` or `undefined`; `loader` is not invoked and no timer
 * starts.
 *
 * The timer is cleared when `loader` settles, and a loader that rejects after
 * the deadline raises no `unhandledRejection`: `Promise.race` handles it.
 *
 * ⚠ `ms` goes to `setTimeout` as is, and Node replaces a delay below 1
 * (`0`, a negative value), above 2147483647 (`Infinity`,
 * `Number.MAX_SAFE_INTEGER`) or `NaN` with 1 ms, so none of them means "no
 * deadline" — call the loader without `withTimeout` for that.
 *
 * In Node, a loader that settles in microtasks beats a 1 ms deadline, and one
 * that waits on I/O can lose to it even when the I/O completes in time, if
 * the thread stays busy past the deadline. `ms` has no guard: a throw on these
 * values would break callers that rely on the clamp.
 */
export function withTimeout<T>(
  routeName: string,
  ms: number,
  loader: (deps: { signal: AbortSignal }) => Promise<T>,
  options?: { upstreamSignal?: AbortSignal | null },
): Promise<T> {
  const upstream = options?.upstreamSignal;

  if (upstream?.aborted) {
    // A non-nullish `reason` is forwarded as is. A platform signal aborted
    // without one carries a `DOMException` already, so the fallback serves
    // `abort(null)` and a duck-typed `{ aborted: true }` cast to
    // `AbortSignal`.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the spec allows any value as `signal.reason`; a non-nullish one is forwarded as is, and the fallback is a `DOMException`, which is an `Error`.
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
    // The Promise executor above runs synchronously, so `timer` is always
    // assigned by the time `finally` fires — and `clearTimeout` accepts
    // `undefined` anyway, so no guard is needed.
    clearTimeout(timer);
  });

  return Promise.race<T>([work, timeoutPromise]);
}
