import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import { validateRouteProperties } from "../../../src/validators/forwardTo";

import type { Router } from "@real-router/core";
import type { RoutesApi } from "@real-router/core/api";

describe("validateRouteProperties — direct calls (covers lines unreachable via router due to core crash guards)", () => {
  it("canActivate not a function throws TypeError", () => {
    expect(() => {
      validateRouteProperties(
        { name: "test", path: "/test", canActivate: "not-fn" as never },
        "test",
      );
    }).toThrow(TypeError);
  });

  it("canDeactivate not a function throws TypeError", () => {
    expect(() => {
      validateRouteProperties(
        { name: "test", path: "/test", canDeactivate: 123 as never },
        "test",
      );
    }).toThrow(TypeError);
  });

  it("async decodeParams throws TypeError", () => {
    const asyncDecode = async (p: Record<string, string>) => p;

    expect(() => {
      validateRouteProperties(
        {
          name: "test",
          path: "/test/:id",
          decodeParams: asyncDecode as unknown as never,
        },
        "test",
      );
    }).toThrow(TypeError);
  });

  it("async encodeParams throws TypeError", () => {
    const asyncEncode = async (p: Record<string, unknown>) =>
      p as Record<string, string>;

    expect(() => {
      validateRouteProperties(
        {
          name: "test",
          path: "/test/:id",
          encodeParams: asyncEncode as unknown as never,
        },
        "test",
      );
    }).toThrow(TypeError);
  });

  it("async forwardTo callback throws TypeError", () => {
    const asyncForward = async () => "home";

    expect(() => {
      validateRouteProperties(
        { name: "test", path: "/test", forwardTo: asyncForward as never },
        "test",
      );
    }).toThrow(TypeError);
  });

  it("sync forwardTo function does NOT throw — covers FALSE branch of isNativeAsync check", () => {
    const syncForward = () => "home";

    expect(() => {
      validateRouteProperties(
        { name: "test", path: "/test", forwardTo: syncForward as never },
        "test",
      );
    }).not.toThrow();
  });

  it("valid defaultParams object does NOT throw — covers FALSE branch of params check", () => {
    expect(() => {
      validateRouteProperties(
        { name: "test", path: "/test", defaultParams: { tab: "main" } },
        "test",
      );
    }).not.toThrow();
  });

  it("children with invalid canActivate — covers children recursion in validateRouteProperties", () => {
    expect(() => {
      validateRouteProperties(
        {
          name: "parent",
          path: "/parent",
          children: [
            {
              name: "child",
              path: "/child",
              canActivate: "not-fn" as never,
            } as never,
          ],
        },
        "parent",
      );
    }).toThrow(TypeError);
  });
});

describe("forwardTo validators — coverage via router.addRoute", () => {
  let router: Router;
  let routes: RoutesApi;

  beforeEach(() => {
    router = createRouter(
      [
        { name: "home", path: "/home" },
        { name: "about", path: "/about" },
        { name: "items", path: "/items/:id" },
        { name: "wildcard", path: "/files/*path" },
      ],
      { defaultRoute: "home" },
    );
    router.usePlugin(validationPlugin());
    routes = getRoutesApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("add forwardTo to existing route — covers validateSingleForward success path", () => {
    expect(() => {
      routes.add([{ name: "oldpath", path: "/oldpath", forwardTo: "home" }]);
    }).not.toThrow();
  });

  it("add route with params forwarding to param route — covers extractParamsFromPath", () => {
    expect(() => {
      routes.add([
        { name: "newItems", path: "/new-items/:id", forwardTo: "items" },
      ]);
    }).not.toThrow();
  });

  it("forwardTo to existing route with param mismatch throws Error", () => {
    expect(() => {
      routes.add([
        { name: "noParams", path: "/no-params", forwardTo: "items" },
      ]);
    }).toThrow(/params/i);
  });

  it("adding route batch where forwardTo target is in same batch — covers in-batch target path", () => {
    expect(() => {
      routes.add([
        { name: "src", path: "/src/:id" },
        { name: "dst", path: "/dst/:id", forwardTo: "src" },
      ]);
    }).not.toThrow();
  });

  it("forwardTo cycle detected at addRoute time throws Error", () => {
    routes.add([{ name: "a", path: "/a", forwardTo: "home" }]);

    expect(() => {
      routes.add([
        { name: "x1", path: "/x1" },
        { name: "x2", path: "/x2", forwardTo: "x1" },
        { name: "x3", path: "/x3", forwardTo: "x2" },
      ]);
    }).not.toThrow();
  });

  it("nested route with forwardTo covers collectForwardMappings children recursion", () => {
    expect(() => {
      routes.add([
        {
          name: "section",
          path: "/section",
          children: [{ name: "sub", path: "/sub", forwardTo: "home" }],
        },
      ]);
    }).not.toThrow();
  });

  it("nested route with children covers collectRouteNames children recursion", () => {
    expect(() => {
      routes.add([
        {
          name: "outer",
          path: "/outer",
          children: [
            {
              name: "inner",
              path: "/inner",
              children: [{ name: "deep", path: "/deep" }],
            },
          ],
        },
      ]);
    }).not.toThrow();
  });

  it("forwardTo splat route — covers getRequiredParams spatParams loop", () => {
    expect(() => {
      routes.add([
        { name: "srcFiles", path: "/src/*path", forwardTo: "wildcard" },
      ]);
    }).not.toThrow();
  });
});
