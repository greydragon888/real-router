import { describe, it, expect, afterEach, vi } from "vitest";

import { createRouter } from "@real-router/core";

import type { Router } from "@real-router/core";

/**
 * registerForwardTo warns when a route declares BOTH `forwardTo` and a
 * guard (canActivate/canDeactivate) — the guard is ignored because forwardTo is
 * a redirect. The warning names the redirect target ("[dynamic]" for a function
 * forwardTo). These messages + the string/function target ternary survive
 * because no test asserts the warn payload. Also pins the async-forwardTo throw
 * message.
 */
let router: Router | undefined;

describe("routesStore — forwardTo + guard warnings", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
    vi.restoreAllMocks();
  });

  it("warns naming the STRING target when forwardTo + canActivate", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router = createRouter([
      { name: "target", path: "/target" },
      {
        name: "src",
        path: "/src",
        forwardTo: "target",
        canActivate: () => () => true,
      },
    ]);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("forwardTo and canActivate"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("canActivate will be ignored"),
    );
    // string target → the actual name, NOT "[dynamic]"
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('target route "target"'),
    );
  });

  it("warns with [dynamic] when forwardTo is a FUNCTION + canActivate", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router = createRouter([
      { name: "target", path: "/target" },
      {
        name: "src",
        path: "/src",
        forwardTo: () => "target",
        canActivate: () => () => true,
      },
    ]);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('target route "[dynamic]"'),
    );
  });

  it("warns naming the STRING target when forwardTo + canDeactivate", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router = createRouter([
      { name: "target", path: "/target" },
      {
        name: "src",
        path: "/src",
        forwardTo: "target",
        canDeactivate: () => () => true,
      },
    ]);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("canDeactivate will be ignored"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('target route "target"'),
    );
  });

  it("warns with [dynamic] when forwardTo is a FUNCTION + canDeactivate", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router = createRouter([
      { name: "target", path: "/target" },
      {
        name: "src",
        path: "/src",
        forwardTo: () => "target",
        canDeactivate: () => () => true,
      },
    ]);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('target route "[dynamic]"'),
    );
  });

  it("throws the async-forwardTo message", () => {
    expect(() =>
      createRouter([
        {
          name: "src",
          path: "/src",
          forwardTo: (async () => "target") as unknown as string,
        },
      ]),
    ).toThrow("Async functions break matchPath/buildPath");
  });
});
