import { EnvironmentInjector } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { provideRealRouter } from "../../src/providers";

const STORAGE_KEY = "real-router:scroll";

const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
];

describe("provideRealRouter — scrollRestoration", () => {
  let router: ReturnType<typeof createRouter>;

  beforeEach(async () => {
    sessionStorage.clear();
    history.scrollRestoration = "auto";
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
    sessionStorage.clear();
    history.scrollRestoration = "auto";
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("no options — history.scrollRestoration unchanged", () => {
    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });
    TestBed.inject(EnvironmentInjector);

    expect(history.scrollRestoration).toBe("auto");
  });

  it("scrollRestoration provided — flips history.scrollRestoration to 'manual'", () => {
    TestBed.configureTestingModule({
      providers: [
        provideRealRouter(router, {
          scrollRestoration: { mode: "restore" },
        }),
      ],
    });
    // Trigger environment initializer.
    TestBed.inject(EnvironmentInjector);

    expect(history.scrollRestoration).toBe("manual");
  });

  it("reset module restores history.scrollRestoration", () => {
    TestBed.configureTestingModule({
      providers: [
        provideRealRouter(router, {
          scrollRestoration: { mode: "restore" },
        }),
      ],
    });
    TestBed.inject(EnvironmentInjector);

    expect(history.scrollRestoration).toBe("manual");

    TestBed.resetTestingModule();

    expect(history.scrollRestoration).toBe("auto");
  });

  it("pagehide captures position when scrollRestoration is enabled", () => {
    Object.defineProperty(globalThis, "scrollY", {
      value: 512,
      configurable: true,
    });

    TestBed.configureTestingModule({
      providers: [
        provideRealRouter(router, {
          scrollRestoration: { mode: "restore" },
        }),
      ],
    });
    TestBed.inject(EnvironmentInjector);

    globalThis.dispatchEvent(new Event("pagehide"));

    const saved = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;

    expect(Object.values(saved)).toContain(512);
  });
});
