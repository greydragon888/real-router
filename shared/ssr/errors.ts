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
 * Race a loader against a deadline. Resolves with the loader's value if it
 * settles first, otherwise rejects with `LoaderTimeout`. The timer is
 * cleared via `.finally()` on the work promise so a fast-path success
 * does not leak the `setTimeout` handle.
 */
export function withTimeout<T>(
  routeName: string,
  ms: number,
  loader: () => Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const work = (async () => loader())().finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  return Promise.race<T>([
    work,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        reject(new LoaderTimeout(routeName, ms));
      }, ms);
    }),
  ]);
}
