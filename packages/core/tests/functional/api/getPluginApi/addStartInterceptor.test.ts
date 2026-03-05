import { describe, afterEach, it, expect } from "vitest";

import { getPluginApi } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, PluginApi } from "@real-router/core";

let router: Router;
let api: PluginApi;

describe("addInterceptor('start')", () => {
  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  it("intercepts start path — interceptor can transform the path", async () => {
    router = createTestRouter();
    api = getPluginApi(router);

    api.addInterceptor("start", (next, path) =>
      next(path === "/original" ? "/home" : path),
    );

    const state = await router.start("/original");

    expect(state.name).toBe("home");
  });

  it("interceptor receives the original start path", async () => {
    router = createTestRouter();
    api = getPluginApi(router);

    let receivedPath: string | undefined;

    api.addInterceptor("start", (next, path) => {
      receivedPath = path;

      return next(path);
    });

    await router.start("/home");

    expect(receivedPath).toBe("/home");
  });

  it("multiple start interceptors compose — last-added is outermost", async () => {
    router = createTestRouter();
    api = getPluginApi(router);

    const order: string[] = [];

    api.addInterceptor("start", (next, path) => {
      order.push("first");

      return next(path);
    });

    api.addInterceptor("start", (next, path) => {
      order.push("second");

      return next(path);
    });

    await router.start("/home");

    expect(order).toStrictEqual(["second", "first"]);
  });
});
