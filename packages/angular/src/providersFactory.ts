import {
  DestroyRef,
  REQUEST,
  TransferState,
  inject,
  makeEnvironmentProviders,
  makeStateKey,
  provideAppInitializer,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
} from "@angular/core";
import {
  getNavigator,
  type DefaultDependencies,
  type PluginFactory,
  type Router,
} from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { hydrateRouter, serializeRouterState } from "@real-router/core/utils";
import { createRouteSource, primeErrorSource } from "@real-router/sources";

import {
  installScrollRestoration,
  installScrollSpy,
  installViewTransitions,
} from "./internal/install";
import { NAVIGATOR, ROUTE, ROUTER } from "./providers";
import { sourceToSignal } from "./sourceToSignal";

import type { ScrollRestorationOptions, ScrollSpyOptions } from "./dom-utils";
import type { RouteSignals } from "./types";

/**
 * `TransferState` key carrying the SSR-resolved router state from server to
 * client as an XSS-safe JSON string (produced by `serializeRouterState`).
 * Populated server-side by the `provideAppInitializer` callback after
 * `router.start()` resolves; consumed client-side after hydration. Mirrors the
 * `<script>window.__SSR_STATE__ = …</script>` pattern used by every other
 * adapter — Angular's idiomatic transport is `TransferState` (#599).
 *
 * Stored as `string`: `serializeRouterState(state)` already produces JSON;
 * `hydrateRouter(router, json)` accepts a JSON string and parses it once
 * internally. Storing the parsed object would force a double round-trip
 * (TransferState wraps every value in JSON for transport).
 *
 * Internal implementation detail. Not re-exported.
 */
const ROUTER_STATE_KEY = makeStateKey<string>("@real-router/angular:ssrState");

/**
 * Factory function for deriving per-request dependencies from an SSR `Request`.
 *
 * - **Server:** receives the real `Request` exposed via Angular's `REQUEST` token.
 * - **SSG:** receives a mocked `Request` injected via `platformProviders`.
 * - **Client:** receives `null` — derive deps from `document.cookie` etc.
 *
 * The returned object becomes the second argument to
 * `cloneRouter(baseRouter, deps)`. Returning `undefined` clones the router with
 * no extra deps (cloneRouter accepts the optional 2nd argument).
 */
export type RequestDepsFactory<
  TDeps extends DefaultDependencies = DefaultDependencies,
> = (request: Request | null) => TDeps | undefined;

/**
 * Function form for conditional plugins (different sets server vs client).
 *
 * Use this when the plugin set must differ — typically because some plugins
 * (e.g. `browser-plugin`, `navigation-plugin`, `hash-plugin`) touch
 * `window.history` / `window.location` and cannot run on the server.
 */
export type RequestPluginsFactory<
  TDeps extends DefaultDependencies = DefaultDependencies,
> = (request: Request | null) => readonly PluginFactory<TDeps>[];

export interface RealRouterFactoryOptions<
  TDeps extends DefaultDependencies = DefaultDependencies,
> {
  /**
   * Base router instance — created once at app bootstrap (typically inside
   * `app.config.ts` module scope). Each request clones this router via
   * `cloneRouter(baseRouter, deps?.(request))`, producing an isolated
   * router with its own state, plugins, and subscriptions.
   *
   * **Important:** the `baseRouter` MUST NOT be started ahead of time —
   * `provideAppInitializer` is responsible for calling `router.start(url)`
   * inside the per-request DI scope.
   */
  baseRouter: Router<TDeps>;

  /**
   * Plugins applied to every per-request router clone.
   *
   * **Static form** — same plugins on both sides:
   * ```ts
   * plugins: [ssrDataPluginFactory(loaders)]
   * ```
   *
   * **Function form** — conditional client vs server (recommended when any
   * browser-only plugin is involved):
   * ```ts
   * plugins: (request) => request
   *   ? [ssrDataPluginFactory(loaders)]
   *   : [browserPluginFactory(), ssrDataPluginFactory(loaders)],
   * ```
   *
   * Function form is required if the plugin list contains
   * `browser-plugin`, `navigation-plugin`, or `hash-plugin` — those plugins
   * read `window.history` / `window.location` and crash on the server.
   */
  plugins?: readonly PluginFactory<TDeps>[] | RequestPluginsFactory<TDeps>;

  /**
   * Derive request-scoped deps (e.g. `currentUser` from cookies). The result
   * is passed to `cloneRouter(baseRouter, deps)` and merged with any deps
   * already registered on the base router.
   *
   * Receives `request: Request | null`:
   * - non-null on server (real `Request` from `@angular/ssr` runtime)
   * - non-null on SSG (mocked `Request` via `platformProviders`)
   * - null on client (derive deps externally — e.g. parse `document.cookie`)
   */
  deps?: RequestDepsFactory<TDeps>;

  /** Optional scroll restoration — same semantics as `provideRealRouter`. */
  scrollRestoration?: ScrollRestorationOptions;

  /** Optional scroll spy — same semantics as `provideRealRouter`. */
  scrollSpy?: ScrollSpyOptions;

  /** Optional view transitions — same semantics as `provideRealRouter`. */
  viewTransitions?: boolean;
}

/**
 * `provideRealRouterFactory` — environment providers for SSR / SSG scenarios.
 *
 * Unlike `provideRealRouter(router)` (single instance via `useValue`), this
 * factory uses `useFactory` to produce a per-request router clone:
 *
 * 1. Reads Angular's `REQUEST` token (`{ optional: true }`).
 * 2. Calls `cloneRouter(baseRouter, deps?.(request))` to create a request-scoped clone.
 * 3. Applies plugins (`plugins` array or `plugins(request)` factory).
 * 4. Registers `provideAppInitializer` that calls `await router.start(url)`.
 * 5. Schedules `router.dispose()` via `DestroyRef.onDestroy` — the request
 *    Injector is destroyed after the response is sent, releasing all
 *    subscriptions and plugins.
 *
 * Use cases:
 * - Angular SSR with `@angular/ssr` (`outputMode: "server"`).
 * - SSG build-time render via `renderApplication` + `platformProviders` `REQUEST` mock.
 * - Multi-tenant request-scoped routing.
 *
 * Existing single-instance scenarios (SPA, SSG client after hydration) continue
 * to use `provideRealRouter(router)` — both APIs ship in parallel.
 *
 * @param options - Factory configuration — see `RealRouterFactoryOptions`.
 * @returns `EnvironmentProviders` to spread into `ApplicationConfig.providers`.
 */
export function provideRealRouterFactory<
  TDeps extends DefaultDependencies = DefaultDependencies,
>(options: RealRouterFactoryOptions<TDeps>): EnvironmentProviders {
  const {
    baseRouter,
    plugins,
    deps,
    scrollRestoration,
    scrollSpy,
    viewTransitions,
  } = options;

  const providers: Parameters<typeof makeEnvironmentProviders>[0] = [
    {
      provide: ROUTER,
      useFactory: (): Router => {
        const request = inject(REQUEST, { optional: true });
        const requestDeps = deps?.(request);
        const router = cloneRouter(baseRouter, requestDeps);

        const pluginList =
          typeof plugins === "function" ? plugins(request) : plugins;

        if (pluginList && pluginList.length > 0) {
          // Variadic — `usePlugin` accepts `(PluginFactory<D> | false | null | undefined)[]`.
          router.usePlugin(...pluginList);
        }

        // Per-request cleanup. The application Injector is destroyed:
        // - On server: after `writeResponseToNodeResponse` finishes the response
        //   (request scope ends).
        // - On client: at `ApplicationRef.destroy` (rare in SPA, common in TestBed).
        // - In SSG build: after each `renderApplication` resolves.
        inject(DestroyRef).onDestroy(() => {
          router.dispose();
        });

        return router as unknown as Router;
      },
    },
    {
      provide: NAVIGATOR,
      useFactory: () => getNavigator(inject(ROUTER)),
    },
    {
      provide: ROUTE,
      useFactory: (): RouteSignals => {
        const router = inject(ROUTER);

        return {
          routeState: sourceToSignal(createRouteSource(router)),
          navigator: inject(NAVIGATOR),
        };
      },
    },
    // Async bootstrap — runs before the first component renders. Three
    // branches based on TransferState population:
    //
    //   1. **Client after hydration** — server populated TransferState with
    //      the SSR-resolved router state. Consume it via `hydrateRouter`,
    //      which deposits the parsed state into the one-shot
    //      `RouterInternals.hydrationState` scratchpad before invoking
    //      `router.start(state.path)`. SSR loader plugins
    //      (`@real-router/ssr-data-plugin`, `@real-router/rsc-server-plugin`)
    //      read the scratchpad and skip the loader on first paint — parity
    //      with the other 5 adapters that consume `<script>__SSR_STATE__</script>` (#596, #599).
    //
    //   2. **Server / SSG** — TransferState empty; run the regular
    //      `router.start(path)`. After it resolves, write the serialized
    //      state back into TransferState so the matching client run lands
    //      in branch 1. Angular's `TransferState` infrastructure
    //      (provided by `provideClientHydration()`) carries this blob to
    //      the client as a `<script id="ng-state">` payload.
    //
    //   3. **Pure CSR** — TransferState empty (never populated by a server
    //      pass), and `inject(REQUEST, { optional: true })` returns null.
    //      Falls into the same `router.start(path)` branch as server-side
    //      but skips the TransferState write (no client to hand off to).
    //
    // Errors propagate (Option A from RFC §10): the bootstrap fails and the
    // server returns 500. Custom error pages should be wired via
    // `RouterErrorBoundary` on subsequent renders.
    provideAppInitializer(async () => {
      const router = inject(ROUTER);

      // #778 P2 / #1232: eagerly create the per-request error source before the
      // first component renders, so a navigation error that fires AFTER start()
      // but BEFORE a lazily-rendered RouterErrorBoundary mounts is still
      // captured (the boundary's createDismissableError reuses this cached
      // source). Symmetric intent to the SPA `provideRealRouter` prime, but done
      // HERE, not in a `provideEnvironmentInitializer`: the factory's router is
      // lazily cloned via `inject(ROUTER)`, so a clone failure (e.g. a disposed
      // baseRouter) must stay on the async Option-A reject path — an env
      // initializer runs earlier and would surface it as a synchronous bootstrap
      // throw. `primeErrorSource` no-ops on a router with no internals registry,
      // so it is safe on the server clone.
      primeErrorSource(router);

      const request = inject(REQUEST, { optional: true });
      const transferState = inject(TransferState);

      const ssrJson = transferState.get(ROUTER_STATE_KEY, null);

      if (ssrJson !== null) {
        // Branch 1: client after hydration — reuse server-resolved state.
        await hydrateRouter(router, ssrJson);
        // One-shot semantic, parity with `delete window.__SSR_STATE__`.
        transferState.remove(ROUTER_STATE_KEY);

        return;
      }

      // Branches 2 & 3: regular start.
      // Browser-plugin's `start` interceptor (when registered) wraps this call
      // with location-derived path. We always pass an explicit string — the
      // interceptor uses the explicit value because `next(path ?? location)`
      // short-circuits when `path` is non-nullish.
      const path = deriveStartPath(request);
      const state = await router.start(path);

      if (request !== null) {
        // Branch 2: running inside `@angular/ssr`'s request handler — write
        // serialized state to TransferState so the matching client run can
        // skip the loader on first paint.
        transferState.set(ROUTER_STATE_KEY, serializeRouterState(state));
      }
    }),
  ];

  if (scrollRestoration) {
    providers.push(
      provideEnvironmentInitializer(() => {
        installScrollRestoration(scrollRestoration);
      }),
    );
  }

  if (scrollSpy && scrollSpy.selector !== "") {
    providers.push(
      provideEnvironmentInitializer(() => {
        installScrollSpy(scrollSpy);
      }),
    );
  }

  if (viewTransitions === true) {
    providers.push(provideEnvironmentInitializer(installViewTransitions));
  }

  return makeEnvironmentProviders(providers);
}

/**
 * Derive the path passed to `router.start(path)`:
 * - Server / SSG: `request.url` → pathname + search.
 * - Client: `window.location` if available.
 * - Fallback: `"/"` (only reachable in synthetic non-browser non-SSR setups).
 */
function deriveStartPath(request: Request | null): string {
  if (request) {
    const url = new URL(request.url);

    return url.pathname + url.search;
  }

  if (typeof globalThis.window !== "undefined") {
    return globalThis.location.pathname + globalThis.location.search;
  }

  return "/";
}
