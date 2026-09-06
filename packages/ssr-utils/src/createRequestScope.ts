import { cloneRouter } from "@real-router/core/api";

import type { Router as RouterClass } from "@real-router/core";
import type { DefaultDependencies, Router } from "@real-router/core/types";

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
 * tied to the request's lifetime, and exposes `dispose()` plus an
 * async-disposal member for `await using`.
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
 * The scope always carries an async-disposal member: the well-known
 * `Symbol.asyncDispose` where the host has it, and otherwise the registry
 * symbol of the same name — the key an esbuild-lowered `await using` looks
 * for. So the statement works where the syntax runs natively (Node.js 24+,
 * Bun, Deno; MDN's `javascript.statements.await_using` owns the version table)
 * and, Node.js 22 LTS included, where esbuild lowers it.
 *
 * ⚠ A member on the scope decides nothing under `tsc` at a downlevel target:
 * that helper throws `TypeError: Symbol.asyncDispose is not defined.` before
 * it looks at the object at all. Toolchains other than these two are
 * unmeasured, so where the deployment target is not yours to pick, use the
 * explicit `try/finally` + `await scope.dispose()` form — which is what the
 * bundled SSR examples use throughout.
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
 * // `await using` — natively, or lowered by esbuild (not by `tsc`)
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

  // ⚠ The key is a symbol on every host — the well-known one, or the
  // registry symbol an esbuild-lowered `await using` falls back to when the
  // host has none. A computed key would instead coerce that host's `undefined`
  // into a string member (#2117). This package's `CLAUDE.md` carries why the
  // registry key is the right stand-in.
  // eslint-disable-next-line unicorn/no-nonstandard-builtin-properties -- reading the well-known `await using` symbol off the host is the point
  const hostSymbol = (Symbol as { asyncDispose?: symbol }).asyncDispose;
  // ⚠ The annotation is load-bearing: without a DECLARED unique-symbol type
  // the computed key below degrades into an index signature (tsc TS2741).
  const asyncDispose: typeof Symbol.asyncDispose =
    typeof hostSymbol === "symbol"
      ? (hostSymbol as typeof Symbol.asyncDispose)
      : (Symbol.for("Symbol.asyncDispose") as typeof Symbol.asyncDispose);

  return {
    router,
    signal,
    dispose,
    [asyncDispose]: dispose,
  };
}
