import { EnvironmentInjector } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { provideRealRouter } from "../../src/providers";

const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
];

describe("provideRealRouter — SSR safety (no global DOM)", () => {
  let router: ReturnType<typeof createRouter>;

  beforeEach(async () => {
    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    // Restore the DOM globals BEFORE tearing TestBed down so its teardown path
    // (DestroyRef callbacks, module reset) runs against a real jsdom document.
    vi.unstubAllGlobals();
    router.stop();
    TestBed.resetTestingModule();
  });

  // This is the ONLY test in the adapter suite that reaches the dom-utils SSR
  // guards through INTEGRATION (public `provideRealRouter`), not a white-box
  // `createX(...)` call. It exists because Angular is the one adapter whose
  // install is NOT effect-gated:
  //
  //   • `providers.ts` wires all three utilities via `provideEnvironmentInitializer`,
  //     which runs on BOTH server and client (no `isPlatformBrowser` split).
  //   • `install.ts` calls createScrollRestoration / createScrollSpy /
  //     createViewTransitions UNCONDITIONALLY and delegates SSR safety to their
  //     dom-utils guards (install.ts:50 states this explicitly).
  //
  // Under `@angular/ssr` the framework supplies DOCUMENT via DI, but the GLOBAL
  // `document` / `window` are undefined in Node. So during a server render these
  // environment initializers execute with no global DOM. React and the other
  // adapters never reach here — their install sits behind an effect/afterNextRender
  // that does not run server-side.
  //
  // Discriminating power (mutation-validated, full no-DOM stub below):
  //   • scroll-restore `typeof globalThis.window === "undefined"` → delete it and
  //     this test THROWS (createScrollRestoration derefs the absent history/window).
  //     LOAD-BEARING.
  //   • view-transitions `typeof document === "undefined"` → delete it and this
  //     test THROWS (the guard expression itself derefs `document.startViewTransition`).
  //     LOAD-BEARING.
  //   • scroll-spy `typeof document === "undefined"` (scroll-spy.ts:553) → deleting
  //     it alone does NOT surface: the very next line feature-detects
  //     IntersectionObserver, also absent under SSR, so createScrollSpy still
  //     NOOPs. The document guard is DEFENSE-IN-DEPTH with the IO guard for the SSR
  //     case — the IO short-circuit is what actually carries scroll-spy's SSR
  //     safety here.
  it("environment initializers NOOP when the browser globals are absent (SSR bootstrap survives)", () => {
    TestBed.configureTestingModule({
      providers: [
        provideRealRouter(router, {
          scrollRestoration: { mode: "restore" },
          scrollSpy: { selector: "[id]" },
          viewTransitions: true,
        }),
      ],
    });

    // Simulate the server render context: Node has NONE of the browser globals
    // the three installers touch. Stubbing only window/document is not faithful —
    // jsdom leaves history/IntersectionObserver/rAF defined, so a guard-less
    // installer would still not crash. Remove them all to reproduce real SSR.
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("history", undefined);
    vi.stubGlobal("sessionStorage", undefined);
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.stubGlobal("MutationObserver", undefined);
    vi.stubGlobal("requestAnimationFrame", undefined);

    // Creating the EnvironmentInjector fires the three
    // `provideEnvironmentInitializer` callbacks (installScrollRestoration /
    // installScrollSpy / installViewTransitions → createX). Every one must
    // short-circuit to its frozen NOOP handle instead of throwing.
    expect(() => TestBed.inject(EnvironmentInjector)).not.toThrow();
  });
});
