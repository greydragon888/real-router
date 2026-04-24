import { EnvironmentInjector } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { provideRealRouter } from "../../src/providers";

const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
];

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

describe("provideRealRouter — viewTransitions", () => {
  let router: ReturnType<typeof createRouter>;

  beforeEach(async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();

    delete (document as any).startViewTransition;
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("no options — utility not wired (no startViewTransition usage on navigate)", async () => {
    const startSpy = stubStartViewTransition();

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });
    TestBed.inject(EnvironmentInjector);

    await router.navigate("users");

    expect(startSpy).not.toHaveBeenCalled();
  });

  it("viewTransitions: true — utility wired, startViewTransition called on navigate", async () => {
    const startSpy = stubStartViewTransition();

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router, { viewTransitions: true })],
    });
    TestBed.inject(EnvironmentInjector);

    await router.navigate("users");

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("viewTransitions: false — utility not wired (falsy guard)", async () => {
    const startSpy = stubStartViewTransition();

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router, { viewTransitions: false })],
    });
    TestBed.inject(EnvironmentInjector);

    await router.navigate("users");

    expect(startSpy).not.toHaveBeenCalled();
  });

  it("reset module tears down utility (no VT on subsequent navigation)", async () => {
    const startSpy = stubStartViewTransition();

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router, { viewTransitions: true })],
    });
    TestBed.inject(EnvironmentInjector);

    await router.navigate("users");

    expect(startSpy).toHaveBeenCalledTimes(1);

    TestBed.resetTestingModule();

    await router.navigate("home");

    // No additional calls — destroyed by DestroyRef.
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("viewTransitions + scrollRestoration — both utilities coexist", async () => {
    const startSpy = stubStartViewTransition();

    TestBed.configureTestingModule({
      providers: [
        provideRealRouter(router, {
          viewTransitions: true,
          scrollRestoration: { mode: "top" },
        }),
      ],
    });
    TestBed.inject(EnvironmentInjector);

    // Scroll restoration flips history.
    expect(history.scrollRestoration).toBe("manual");

    await router.navigate("users");

    // VT fires independently.
    expect(startSpy).toHaveBeenCalledTimes(1);
  });
});
