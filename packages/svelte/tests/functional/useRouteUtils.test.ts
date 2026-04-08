import { RouteUtils } from "@real-router/route-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import RouteUtilsCapture from "../helpers/RouteUtilsCapture.svelte";

import type { Router } from "@real-router/core";

describe("useRouteUtils composable", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return a RouteUtils instance", () => {
    let result: any;

    renderWithRouter(router, RouteUtilsCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    expect(result).toBeInstanceOf(RouteUtils);
    expect(result.getChain).toBeTypeOf("function");
    expect(result.getSiblings).toBeTypeOf("function");
    expect(result.isDescendantOf).toBeTypeOf("function");
  });

  it("should have working getChain method", () => {
    let result: any;

    renderWithRouter(router, RouteUtilsCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    const chain = result.getChain("users.list");

    expect(chain).toStrictEqual(["users", "users.list"]);
  });

  it("should have working getSiblings method", () => {
    let result: any;

    renderWithRouter(router, RouteUtilsCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    const siblings = result.getSiblings("users.list");

    expect(siblings).toContain("users.view");
    expect(siblings).toContain("users.edit");
    expect(siblings).not.toContain("users.list");
  });

  it("should have working isDescendantOf method", () => {
    let result: any;

    renderWithRouter(router, RouteUtilsCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    expect(result.isDescendantOf("users.list", "users")).toBe(true);
    expect(result.isDescendantOf("users", "items")).toBe(false);
  });

  it("should return different RouteUtils instances for different routers", async () => {
    const router2 = createTestRouterWithADefaultRouter();

    await router2.start();

    let result1: any;
    let result2: any;

    renderWithRouter(router, RouteUtilsCapture, {
      onCapture: (r: unknown) => {
        result1 = r;
      },
    });

    renderWithRouter(router2, RouteUtilsCapture, {
      onCapture: (r: unknown) => {
        result2 = r;
      },
    });

    expect(result1).toBeInstanceOf(RouteUtils);
    expect(result2).toBeInstanceOf(RouteUtils);
    expect(result1).not.toBe(result2);

    router2.stop();
  });

  it("should return undefined for unknown routes", () => {
    let result: any;

    renderWithRouter(router, RouteUtilsCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    expect(result.getChain("nonexistent")).toBeUndefined();
    expect(result.getSiblings("nonexistent")).toBeUndefined();
  });
});
