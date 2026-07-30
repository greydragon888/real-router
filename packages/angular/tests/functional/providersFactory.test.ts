/* eslint-disable @typescript-eslint/no-extraneous-class -- Angular test host components use empty classes with @Component decorators */
import {
  ApplicationInitStatus,
  Component,
  EnvironmentInjector,
  Injector,
  REQUEST,
  TransferState,
  inject,
  makeStateKey,
  provideAppInitializer,
  runInInjectionContext,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import {
  createRouter,
  type PluginFactory,
  type Router,
} from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterErrorBoundary } from "../../src/components/RouterErrorBoundary";
import { NAVIGATOR, ROUTE, ROUTER } from "../../src/providers";
import {
  provideRealRouterFactory,
  type RealRouterFactoryOptions,
} from "../../src/providersFactory";

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];

interface AppDeps {
  currentUser: string | null;
}

function createBaseRouter() {
  return createRouter(routes);
}

describe("provideRealRouterFactory", () => {
  let baseRouter: ReturnType<typeof createBaseRouter>;

  beforeEach(() => {
    baseRouter = createBaseRouter();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    baseRouter.dispose();
  });

  describe("basic factory & DI wiring", () => {
    it("creates a per-request router that differs from baseRouter", async () => {
      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router = TestBed.inject(ROUTER);

      expect(router).not.toBe(baseRouter);
      expect(router.isActive()).toBe(true);
      expect(router.getState()?.name).toBe("home");
    });

    it("provides NAVIGATOR token bound to the cloned router", async () => {
      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router = TestBed.inject(ROUTER);
      const navigator = TestBed.inject(NAVIGATOR);

      expect(navigator.getState()?.name).toBe(router.getState()?.name);
    });

    it("provides ROUTE signal bound to the cloned router state", async () => {
      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const injector = TestBed.inject(Injector);

      runInInjectionContext(injector, () => {
        const route = TestBed.inject(ROUTE);

        expect(route.routeState().route?.name).toBe("home");
      });
    });
  });

  describe("REQUEST token integration", () => {
    it("derives request-scoped deps via REQUEST", async () => {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: new Request("http://localhost/users/42", {
              headers: { cookie: "user=alice" },
            }),
          },
          provideRealRouterFactory<AppDeps>({
            baseRouter: baseRouter as unknown as Router<AppDeps>,
            deps: (request) => ({
              currentUser: request?.headers.get("cookie") ?? null,
            }),
          }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router = TestBed.inject(ROUTER) as unknown as Router<AppDeps>;

      expect(getDependenciesApi(router).get("currentUser")).toBe("user=alice");
    });

    it("provideAppInitializer starts router with request URL pathname+search", async () => {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: new Request("http://localhost/users/42?sort=desc"),
          },
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router = TestBed.inject(ROUTER);
      const state = router.getState();

      expect(state?.name).toBe("users.profile");
      expect(state?.params).toStrictEqual({ id: "42" });
      expect(state?.search).toStrictEqual({ sort: "desc" });
    });

    it("REQUEST is optional — falls back to window.location on client", async () => {
      TestBed.configureTestingModule({
        providers: [
          provideRealRouterFactory<AppDeps>({
            baseRouter: baseRouter as unknown as Router<AppDeps>,
            deps: (request) => ({
              currentUser: request ? "from-server" : "from-client",
            }),
          }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router = TestBed.inject(ROUTER) as unknown as Router<AppDeps>;

      expect(getDependenciesApi(router).get("currentUser")).toBe("from-client");
      expect(router.getState()?.name).toBe("home");
    });

    it("no REQUEST and no window → deriveStartPath falls back to '/'", async () => {
      // Discriminating setup: window.location points at /users, so the
      // client branch would resolve the "users" route — only the final
      // `return "/"` fallback resolves "home".
      history.pushState(null, "", "/users");
      vi.stubGlobal("window", undefined);

      try {
        TestBed.configureTestingModule({
          providers: [provideRealRouterFactory({ baseRouter })],
        });

        await TestBed.inject(ApplicationInitStatus).donePromise;

        const router = TestBed.inject(ROUTER);

        expect(router.getState()?.name).toBe("home");
      } finally {
        vi.unstubAllGlobals();
        history.pushState(null, "", "/");
      }
    });
  });

  describe("plugin handling", () => {
    it("applies static plugins array on every clone", async () => {
      const startSpy = vi.fn();
      const plugin: PluginFactory = () => ({
        onStart: () => startSpy(),
      });

      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({ baseRouter, plugins: [plugin] }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      expect(startSpy).toHaveBeenCalledTimes(1);
    });

    it("conditional plugins function form differentiates server vs client", async () => {
      const serverSpy = vi.fn();
      const clientSpy = vi.fn();

      const serverPlugin: PluginFactory = () => ({
        onStart: () => serverSpy(),
      });
      const clientPlugin: PluginFactory = () => ({
        onStart: () => clientSpy(),
      });

      const options: RealRouterFactoryOptions = {
        baseRouter,
        plugins: (request) => (request ? [serverPlugin] : [clientPlugin]),
      };

      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: new Request("http://localhost/"),
          },
          provideRealRouterFactory(options),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      expect(serverSpy).toHaveBeenCalledTimes(1);
      expect(clientSpy).not.toHaveBeenCalled();
    });

    it("plugin function form returning empty array is a no-op", async () => {
      const fn = vi.fn(() => []);

      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({ baseRouter, plugins: fn }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      expect(fn).toHaveBeenCalledTimes(1);
      expect(TestBed.inject(ROUTER).isActive()).toBe(true);
    });
  });

  describe("DestroyRef cleanup", () => {
    it("disposes router on injector teardown — subsequent navigate throws ROUTER_DISPOSED", async () => {
      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router = TestBed.inject(ROUTER);

      TestBed.resetTestingModule();

      expect(() => router.navigate("users")).toThrow(/disposed/i);
    });

    it("dispose is idempotent — multiple resets do not throw", async () => {
      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      TestBed.inject(ROUTER);

      expect(() => TestBed.resetTestingModule()).not.toThrow();
    });
  });

  describe("concurrent request isolation", () => {
    it("two TestBed environments produce independent routers with different states", async () => {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: new Request("http://localhost/users/1"),
          },
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router1 = TestBed.inject(ROUTER);
      const params1 = router1.getState()?.params;

      TestBed.resetTestingModule();

      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: new Request("http://localhost/users/2"),
          },
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router2 = TestBed.inject(ROUTER);
      const params2 = router2.getState()?.params;

      expect(router1).not.toBe(router2);
      expect(params1).toStrictEqual({ id: "1" });
      expect(params2).toStrictEqual({ id: "2" });
    });

    it("baseRouter is never started or mutated by the factory", () => {
      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      expect(baseRouter.isActive()).toBe(false);
    });
  });

  describe("SSG / platformProviders REQUEST mock", () => {
    it("mocked REQUEST in providers propagates to ROUTER useFactory", async () => {
      const capturedUrls: string[] = [];

      const captureUrlPlugin: PluginFactory = () => ({
        onTransitionSuccess: (state) => {
          capturedUrls.push(state.path);
        },
      });

      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: new Request("http://localhost/users/99?lang=en"),
          },
          provideRealRouterFactory({
            baseRouter,
            plugins: [captureUrlPlugin],
          }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router = TestBed.inject(ROUTER);

      expect(router.getState()?.name).toBe("users.profile");
      expect(router.getState()?.params).toStrictEqual({ id: "99" });
      expect(router.getState()?.search).toStrictEqual({ lang: "en" });
    });
  });

  describe("scrollRestoration option", () => {
    beforeEach(() => {
      sessionStorage.clear();
      history.scrollRestoration = "auto";
    });

    afterEach(() => {
      sessionStorage.clear();
      history.scrollRestoration = "auto";
    });

    it("scrollRestoration enabled — flips history.scrollRestoration to manual", async () => {
      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({
            baseRouter,
            scrollRestoration: { mode: "restore" },
          }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;
      TestBed.inject(EnvironmentInjector);

      expect(history.scrollRestoration).toBe("manual");
    });

    it("scrollRestoration teardown via DestroyRef restores history.scrollRestoration", async () => {
      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({
            baseRouter,
            scrollRestoration: { mode: "restore" },
          }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;
      TestBed.inject(EnvironmentInjector);

      expect(history.scrollRestoration).toBe("manual");

      TestBed.resetTestingModule();

      expect(history.scrollRestoration).toBe("auto");
    });
  });

  describe("scrollSpy option", () => {
    const ioInstances: { observe: ReturnType<typeof vi.fn> }[] = [];

    beforeEach(() => {
      ioInstances.length = 0;
      document.body.innerHTML = "<section id='spy-a'></section>";

      const FakeIO = class {
        public observe = vi.fn();
        public unobserve = vi.fn();
        public disconnect = vi.fn();

        constructor(_cb: IntersectionObserverCallback) {
          ioInstances.push({ observe: this.observe });
        }

        public takeRecords(): IntersectionObserverEntry[] {
          return [];
        }
      };

      vi.stubGlobal("IntersectionObserver", FakeIO);
    });

    afterEach(() => {
      document.body.innerHTML = "";
      vi.unstubAllGlobals();
    });

    it("scrollSpy with selector — environment initializer installs the observer", async () => {
      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({
            baseRouter,
            scrollSpy: { selector: "[id]" },
          }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;
      TestBed.inject(EnvironmentInjector);

      expect(ioInstances).toHaveLength(1);
      expect(ioInstances[0]?.observe).toHaveBeenCalled();
    });

    it("scrollSpy with empty selector — initializer not registered", async () => {
      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({
            baseRouter,
            scrollSpy: { selector: "" },
          }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;
      TestBed.inject(EnvironmentInjector);

      expect(ioInstances).toHaveLength(0);
    });
  });

  describe("viewTransitions option", () => {
    function stubStartViewTransition(): ReturnType<typeof vi.fn> {
      const startSpy = vi.fn((cb: () => void | Promise<void>) => {
        void cb();

        return { skipTransition: vi.fn() };
      });

      (
        document as Document & { startViewTransition?: unknown }
      ).startViewTransition =
        startSpy as unknown as Document["startViewTransition"];

      return startSpy;
    }

    afterEach(() => {
      delete (document as { startViewTransition?: unknown })
        .startViewTransition;
    });

    it("viewTransitions: true — startViewTransition called on navigate", async () => {
      const startSpy = stubStartViewTransition();

      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({ baseRouter, viewTransitions: true }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;
      TestBed.inject(EnvironmentInjector);

      const router = TestBed.inject(ROUTER);

      await router.navigate("users");

      expect(startSpy).toHaveBeenCalledTimes(1);
    });

    it("viewTransitions: false — startViewTransition NOT called", async () => {
      const startSpy = stubStartViewTransition();

      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({ baseRouter, viewTransitions: false }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;
      TestBed.inject(EnvironmentInjector);

      const router = TestBed.inject(ROUTER);

      await router.navigate("users");

      expect(startSpy).not.toHaveBeenCalled();
    });

    it("viewTransitions + scrollRestoration coexist independently", async () => {
      const startSpy = stubStartViewTransition();

      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({
            baseRouter,
            viewTransitions: true,
            scrollRestoration: { mode: "top" },
          }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;
      TestBed.inject(EnvironmentInjector);

      expect(history.scrollRestoration).toBe("manual");

      const router = TestBed.inject(ROUTER);

      await router.navigate("users");

      expect(startSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("error propagation", () => {
    it("cloneRouter failure on disposed baseRouter rejects bootstrap (Option A — rethrow)", async () => {
      baseRouter.dispose();

      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await expect(
        TestBed.inject(ApplicationInitStatus).donePromise,
      ).rejects.toThrow();
    });
  });

  describe("error source priming (#1232)", () => {
    // Symmetric with the SPA `provideRealRouter` P2 test
    // (reactive-lifecycle.test.ts): a navigation error that fires AFTER a
    // successful start() but BEFORE a lazily-rendered RouterErrorBoundary mounts
    // must still be captured. `provideRealRouterFactory` must eagerly prime the
    // per-request error source at bootstrap — exactly as the SPA path does.
    // Without the prime the boundary's `createDismissableError` creates the
    // error source lazily on init, AFTER the error, and stays silent (#1232).
    it("a RouterErrorBoundary mounted AFTER a post-start navigation error shows the error", async () => {
      @Component({
        template: `<router-error-boundary
          ><span>app</span></router-error-boundary
        >`,
        imports: [RouterErrorBoundary],
      })
      class BoundaryHost {}

      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: new Request("http://localhost/") },
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      // Bootstrap: environment initializers (the prime) + app initializer
      // (start at "/").
      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router = TestBed.inject(ROUTER);

      // Navigation error AFTER a successful start, BEFORE the boundary mounts.
      await router.navigate("nonexistent").catch(() => {});

      // Now mount the boundary (e.g. a lazily-rendered error region).
      const fixture = TestBed.createComponent(BoundaryHost);

      fixture.detectChanges();

      const boundary = fixture.debugElement.query(
        By.directive(RouterErrorBoundary),
      ).componentInstance as RouterErrorBoundary;

      const ctx = boundary.errorContext();

      expect(ctx).not.toBeNull();
      expect(ctx!.$implicit.code).toBe("ROUTE_NOT_FOUND");
    });
  });

  describe("TransferState bridge (#599)", () => {
    // Mirrors the post-hydration loader skip pattern verified in 5 other
    // adapters via window.__SSR_STATE__ + hydrateRouter; Angular delivers
    // the same payload through TransferState.

    const ROUTER_STATE_KEY_NAME = "@real-router/angular:ssrState";

    it("server-side write: TransferState gets the SSR-resolved router state after start()", async () => {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: new Request("http://localhost/users/42"),
          },
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const transferState = TestBed.inject(TransferState);
      const stored = transferState.get(
        makeStateKey<string>(ROUTER_STATE_KEY_NAME),
        null,
      );

      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!) as { name: string; path: string };

      expect(parsed.name).toBe("users.profile");
      expect(parsed.path).toBe("/users/42");
    });

    // Note: the client-side consume path (TransferState seed → hydrateRouter
    // → loader skip on first paint) is verified end-to-end in
    // examples/web/angular/ssr-examples/ssr/e2e — the full Angular SSR
    // pipeline (server pass populating ng-state, client pass restoring it,
    // hydrateRouter consuming the scratchpad) requires `provideClientHydration()`
    // + a real `@angular/ssr` runtime that TestBed's bare module doesn't
    // emulate faithfully. The functional contract of this provider is:
    // 1) writes serialized state on the server, 2) falls back to start() on
    // pure CSR — both covered below.

    it("pure CSR (no TransferState seed, no REQUEST) falls back to router.start(path)", async () => {
      // Empty TransferState + null REQUEST → regular start path. No
      // TransferState write either (no client to hand off to).
      TestBed.configureTestingModule({
        providers: [
          // No REQUEST.
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const transferState = TestBed.inject(TransferState);
      const stored = transferState.get(
        makeStateKey<string>(ROUTER_STATE_KEY_NAME),
        null,
      );

      // Pure CSR: no SSR write into TransferState.
      expect(stored).toBeNull();

      // Router still bootstrapped successfully via the regular start path.
      const router = TestBed.inject(ROUTER);

      expect(router.isActive()).toBe(true);
    });

    // Closes review-2026-05-10 §5.7 ⛔ MED ("TransferState client read
    // (hydrateRouter) — unit test missing"). Pre-seeds TransferState with
    // an SSR-rendered router payload BEFORE bootstrap; verifies the
    // client-side branch: (1) `hydrateRouter` consumes the JSON, (2) the
    // one-shot TransferState entry is REMOVED after consumption (parity
    // with `delete window.__SSR_STATE__` in other adapters), (3) router
    // state matches the seeded payload's `name`/`params` (NOT the path
    // that would have been derived from `window.location` / REQUEST).
    it("client-side hydration: pre-seeded TransferState → hydrateRouter consumes + removes entry", async () => {
      const seededState = JSON.stringify({
        name: "users.profile",
        params: { id: "999" },
        path: "/users/999",
        context: {},
      });

      // Seed TransferState via `provideAppInitializer` registered BEFORE
      // `provideRealRouterFactory`. App initializers run in registration
      // order; the seeding one writes to TransferState first, then the
      // factory's initializer reads it and consumes via `hydrateRouter`.
      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: null,
          },
          // Seed initializer — runs first.
          provideAppInitializer(() => {
            const ts = inject(TransferState);

            ts.set(makeStateKey<string>(ROUTER_STATE_KEY_NAME), seededState);
          }),
          // Then the factory's provideAppInitializer reads the seed.
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      // (1) Router state matches the seeded payload, NOT a CSR-derived path.
      const router = TestBed.inject(ROUTER);
      const state = router.getState();

      expect(state?.name).toBe("users.profile");
      expect(state?.params).toStrictEqual({ id: "999" });

      // (2) TransferState entry was REMOVED after consumption (one-shot
      // semantic — `transferState.remove(ROUTER_STATE_KEY)` at line 241).
      const transferState = TestBed.inject(TransferState);
      const stillStored = transferState.get(
        makeStateKey<string>(ROUTER_STATE_KEY_NAME),
        null,
      );

      expect(stillStored).toBeNull();

      // (3) Router is active and reads the hydrated state — no `start()`
      // was called (which would have used baseRouter's defaultRoute path,
      // not the seeded "users.profile" route).
      expect(router.isActive()).toBe(true);
    });
  });

  // Closes review-2026-05-10 §5.7 ⛔ LOW: deriveStartPath fallback "/" when
  // neither REQUEST nor window.location is meaningful. In JSDOM `window`
  // exists and `location.pathname` defaults to "/", so this branch is
  // exercised implicitly by the "REQUEST is optional — falls back to
  // window.location on client" test (line 154-173). Explicit pin-test
  // for the case where REQUEST is null and `window.location.pathname` is
  // exactly "/" — verifies the fallback resolves "home" as the active
  // route.
  describe("deriveStartPath fallback (review §5.7 LOW)", () => {
    it("no REQUEST + window.location='/' → router starts at 'home' (defaultRoute)", async () => {
      // jsdom defaults to http://localhost/ → pathname = "/".
      TestBed.configureTestingModule({
        providers: [provideRealRouterFactory({ baseRouter })],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router = TestBed.inject(ROUTER);

      expect(router.getState()?.name).toBe("home");
      expect(router.isActive()).toBe(true);
    });
  });
});
