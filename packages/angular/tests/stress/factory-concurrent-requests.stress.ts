import { ApplicationInitStatus, REQUEST } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MB, takeHeapSnapshot } from "./helpers";
import { ROUTER, ROUTE } from "../../src/providers";
import { provideRealRouterFactory } from "../../src/providersFactory";

import type { Router } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
  { name: "admin", path: "/admin" },
];

/**
 * Closes review §7.2 (MED gap) — `provideRealRouterFactory` with 100+
 * requests. In Angular SSR the per-request lifecycle is owned by the
 * platform-level Application: each request bootstraps its own
 * `ApplicationRef` whose `EnvironmentInjector` holds the `provideAppInitializer`.
 *
 * In TestBed we can only have one top-level Application at a time
 * (`TestBed.inject(ApplicationInitStatus)` is the platform-singleton). So
 * "concurrent" requests are simulated by **rapid sequential** request-scoped
 * setups — `TestBed.resetTestingModule()` + `configureTestingModule()` per
 * request, 100 cycles total. This mirrors the realistic SSR per-request
 * fan-out: each request gets a fresh router clone, a fresh ROUTE signal, a
 * fresh deps invocation, fresh plugin factory call; teardown happens between
 * iterations via `resetTestingModule()` which destroys the prior
 * EnvironmentInjector.
 */
describe("provideRealRouterFactory request-scope stress", () => {
  let baseRouter: ReturnType<typeof createRouter>;

  beforeEach(() => {
    baseRouter = createRouter(routes);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    baseRouter.dispose();
  });

  it("(a) 100 sequential request-scoped injectors — each starts a clean router, disposes on tear-down", async () => {
    const heapBefore = takeHeapSnapshot();
    const seenRouters: Router[] = [];

    for (let i = 0; i < 100; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: new Request(`http://localhost/users/${i}`),
          },
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router = TestBed.inject(ROUTER);

      seenRouters.push(router);

      expect(router).not.toBe(baseRouter);

      // Distinct router each request.
      for (let j = 0; j < seenRouters.length - 1; j++) {
        expect(router).not.toBe(seenRouters[j]);
      }

      expect(router.getState()?.name).toBe("users.profile");
      expect(router.getState()?.params).toStrictEqual({ id: String(i) });
    }

    TestBed.resetTestingModule();
    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(100 * MB);
  }, 90_000);

  it("(b) 100 requests — deps factory is called per request with the matching REQUEST", async () => {
    interface AppDeps {
      sessionId: string | null;
    }

    const depsFactoryCalls: (string | null)[] = [];

    for (let i = 0; i < 100; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: new Request("http://localhost/", {
              headers: { cookie: `session=req-${i}` },
            }),
          },
          provideRealRouterFactory<AppDeps>({
            baseRouter: baseRouter as unknown as Router<AppDeps>,
            deps: (request) => {
              const sessionId = request?.headers.get("cookie") ?? null;

              depsFactoryCalls.push(sessionId);

              return { sessionId };
            },
          }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;
    }

    expect(depsFactoryCalls).toHaveLength(100);

    for (let i = 0; i < 100; i++) {
      expect(depsFactoryCalls[i]).toBe(`session=req-${i}`);
    }
  }, 60_000);

  it("(c) 100 requests — plugins factory invoked once per request with the right REQUEST", async () => {
    const sawRequestUrls: string[] = [];

    for (let i = 0; i < 100; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: new Request(`http://localhost/admin?n=${i}`),
          },
          provideRealRouterFactory({
            baseRouter,
            plugins: (request) => {
              if (request) {
                sawRequestUrls.push(request.url);
              }

              return [];
            },
          }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;
    }

    expect(sawRequestUrls).toHaveLength(100);

    for (let i = 0; i < 100; i++) {
      expect(sawRequestUrls[i]).toBe(`http://localhost/admin?n=${i}`);
    }
  }, 60_000);

  it("(d) 50 requests — ROUTE signal is request-scoped (distinct routeState across requests)", async () => {
    const seenSignals = new Set<unknown>();
    const seenNames: string[] = [];

    for (let i = 0; i < 50; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: new Request(`http://localhost/users/${i}`),
          },
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const route = TestBed.inject(ROUTE);

      seenSignals.add(route.routeState);
      seenNames.push(route.routeState().route?.name ?? "");
    }

    // Each request → distinct Signal identity.
    expect(seenSignals.size).toBe(50);
    expect(seenNames.every((n) => n === "users.profile")).toBe(true);
  }, 60_000);

  it("(e) 100 requests with no REQUEST → factory falls back to CSR start path", async () => {
    // When REQUEST is absent (pure CSR), the factory derives the start path
    // from window.location (jsdom defaults to http://localhost/ → path "/").
    const seenRouters: Router[] = [];

    for (let i = 0; i < 100; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideRealRouterFactory({ baseRouter })],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router = TestBed.inject(ROUTER);

      seenRouters.push(router);

      // All resolve to "home" because jsdom is at "/".
      expect(router.getState()?.name).toBe("home");
    }

    // Distinct router instance each time.
    const unique = new Set(seenRouters);

    expect(unique.size).toBe(100);
  }, 60_000);

  it("(f) 50 requests with mixed deps + plugins — no cross-talk between requests", async () => {
    interface AppDeps {
      tag: string;
    }

    let pluginsCalled = 0;
    const depTags: string[] = [];

    for (let i = 0; i < 50; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: new Request(`http://localhost/?tag=${i}`),
          },
          provideRealRouterFactory<AppDeps>({
            baseRouter: baseRouter as unknown as Router<AppDeps>,
            deps: (request) => {
              const url = new URL(request?.url ?? "http://localhost/");
              const tag = url.searchParams.get("tag") ?? "";

              depTags.push(tag);

              return { tag };
            },
            plugins: () => {
              pluginsCalled += 1;

              return [];
            },
          }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;
    }

    expect(pluginsCalled).toBe(50);
    expect(depTags).toHaveLength(50);

    // Tags are sequential (no shuffling across "requests").
    for (let i = 0; i < 50; i++) {
      expect(depTags[i]).toBe(String(i));
    }
  }, 60_000);
});
