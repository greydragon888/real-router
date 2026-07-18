import { cloneRouter } from "../api/cloneRouter";

import type { DefaultDependencies, Router } from "../public-types";
import type { Router as RouterClass } from "../Router";

/**
 * Subset of Node's `http.IncomingMessage` that `createRequestScope` relies on:
 * a `"close"` event indicating that the client disconnected (or the response
 * was fully sent) and the standard `removeListener` cleanup hook.
 */
export interface IncomingMessageLike {
  on: (event: "close", listener: () => void) => unknown;
  removeListener?: (event: "close", listener: () => void) => unknown;
}

/**
 * Web `Request`-shaped object — anything carrying an `AbortSignal`. Web
 * runtimes (Bun, Cloudflare Workers, Vite RSC) surface client-disconnect via
 * `request.signal` directly, so no listener attachment is needed.
 */
export interface RequestLike {
  signal: AbortSignal;
}

export type RequestScopeSource = IncomingMessageLike | RequestLike;

export interface RequestScope<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> extends AsyncDisposable {
  /**
   * Per-request router clone. Carries `abortSignal` injected into its
   * dependencies — loaders can `getDep("abortSignal")` and pass it to fetch /
   * `withTimeout` for cooperative cancellation when the client disconnects.
   */
  readonly router: RouterClass<Dependencies>;

  /**
   * Aborts when the request closes (Node `IncomingMessage`'s `"close"` event)
   * or when the upstream Web `Request.signal` aborts.
   */
  readonly signal: AbortSignal;

  /**
   * Detach the close listener (if attached to a Node `IncomingMessage`) and
   * dispose the cloned router. Idempotent — safe to call multiple times or in
   * combination with `Symbol.asyncDispose`.
   */
  dispose: () => Promise<void>;
}

function isRequestLike(request: RequestScopeSource): request is RequestLike {
  return (
    "signal" in request &&
    typeof (request as Partial<RequestLike>).signal === "object" &&
    (request as Partial<RequestLike>).signal !== undefined &&
    typeof request.signal.aborted === "boolean"
  );
}

/**
 * Build a per-request router scope: clones `base`, attaches an `AbortSignal`
 * tied to the request's lifetime, and exposes `dispose()` (plus
 * `Symbol.asyncDispose` for `await using` declarations).
 *
 * Replaces the four-step boilerplate that every server entry repeats:
 *
 * 1. `new AbortController()` per request
 * 2. `req.on("close", () => controller.abort())`
 * 3. `cloneRouter(base, { ...deps, abortSignal: signal })`
 * 4. `try { ... } finally { router.dispose() }`
 *
 * The signal is injected into the router clone under `abortSignal` so existing
 * loaders that read `getDep("abortSignal")` keep working without changes. If
 * `deps` already carries an `abortSignal`, the request-tied signal **wins** (it
 * is spread last) — a caller-supplied `abortSignal` is intentionally overridden,
 * since the scope's purpose is to own the request-lifecycle signal.
 *
 * ## `await using` compatibility
 *
 * The scope implements `Symbol.asyncDispose`, so `await using scope = …` is
 * supported on runtimes that ship the well-known `Symbol.asyncDispose`:
 *
 * - **Node.js 24+** (full support; partial in 20.4–20.17 only for `fs`/`stream`)
 * - **Bun 1.0.23+**, **Deno 1.37+**
 * - **Chrome / Edge 127+**, **Firefox 141+**
 * - **Safari**: not yet supported (irrelevant in practice — this helper is
 *   server-side only and never reaches the browser)
 *
 * On Node.js 22 LTS the well-known symbol is unavailable, so `await using`
 * fails. **The bundled SSR examples therefore use the explicit
 * `try/finally` + `await scope.dispose()` form**, which works on every
 * runtime. Use `await using` only when you control the deployment target and
 * know it ships the symbol.
 *
 * @example
 * ```typescript
 * // Explicit dispose — works on Node 18+, all browsers, every CI image
 * export async function render(url: string, req: IncomingMessage) {
 *   const scope = createRequestScope(req, baseRouter, { currentUser });
 *   try {
 *     scope.router.usePlugin(ssrDataPluginFactory(loaders));
 *     return await renderShell(scope.router, url);
 *   } finally {
 *     await scope.dispose();
 *   }
 * }
 *
 * // `await using` — Node 24+, Bun, Deno, modern browsers
 * export async function render(url: string, req: IncomingMessage) {
 *   await using scope = createRequestScope(req, baseRouter, { currentUser });
 *   scope.router.usePlugin(ssrDataPluginFactory(loaders));
 *   return await renderShell(scope.router, url);
 * }
 *
 * // Web runtime (signal already on the request)
 * async function handler(request: Request) {
 *   const scope = createRequestScope(request, baseRouter, { db });
 *   try {
 *     scope.router.usePlugin(rscServerPluginFactory(loaders));
 *     return await render(scope.router, request.url);
 *   } finally {
 *     await scope.dispose();
 *   }
 * }
 * ```
 */
export function createRequestScope<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  request: RequestScopeSource,
  base: Router<Dependencies>,
  deps?: Partial<Dependencies>,
): RequestScope<Dependencies> {
  let detach: (() => void) | undefined;
  let attach: (() => void) | undefined;
  let signal: AbortSignal;

  if (isRequestLike(request)) {
    signal = request.signal;
  } else {
    const controller = new AbortController();
    const onClose = (): void => {
      controller.abort();
    };

    signal = controller.signal;
    // Clone-before-attach (#969): defer attaching the "close" listener until
    // after cloneRouter succeeds. cloneRouter is synchronous, so no "close"
    // macrotask can fire in the gap; and if it throws (e.g. ROUTER_DISPOSED on
    // an already-disposed base) the helper exits without returning a scope
    // handle — so a listener attached here would strand on the request with no
    // way to detach it.
    attach = () => {
      request.on("close", onClose);
    };
    detach = () => {
      request.removeListener?.("close", onClose);
    };
  }

  const router = cloneRouter(base, {
    ...deps,
    abortSignal: signal,
  } as Dependencies);

  // The clone exists — now it is safe to attach the close listener (Node path
  // only; `attach` is undefined for the Web path).
  attach?.();

  let disposed = false;

  const dispose = (): Promise<void> => {
    if (disposed) {
      return Promise.resolve();
    }

    disposed = true;
    detach?.();
    router.dispose();

    return Promise.resolve();
  };

  return {
    router,
    signal,
    dispose,
    // eslint-disable-next-line unicorn/no-nonstandard-builtin-properties -- Symbol.asyncDispose is a standard ES2023 well-known symbol (`await using`)
    [Symbol.asyncDispose]: dispose,
  };
}
