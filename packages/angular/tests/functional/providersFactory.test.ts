import {
  ApplicationInitStatus,
  EnvironmentInjector,
  Injector,
  REQUEST,
  runInInjectionContext,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  createRouter,
  type PluginFactory,
  type Router,
} from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

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
      expect(state?.params).toStrictEqual({ id: "42", sort: "desc" });
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
      expect(router.getState()?.params).toStrictEqual({
        id: "99",
        lang: "en",
      });
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
});
