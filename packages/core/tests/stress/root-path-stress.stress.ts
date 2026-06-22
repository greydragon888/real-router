import { describe, afterEach, it, expect } from "vitest";

import { getPluginApi } from "@real-router/core/api";

import { createStressRouter } from "./helpers";

import type { Router } from "@real-router/core";

describe("S24: setRootPath concurrent changes", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S24.1: 3000 cycles setRootPath + navigate — consistent behavior", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    const pluginApi = getPluginApi(router);

    for (let i = 0; i < 3000; i++) {
      const prefix = `/app${i}`;

      pluginApi.setRootPath(prefix);

      expect(pluginApi.getRootPath()).toBe(prefix);

      const target = (i % 9) + 1;

      await router.navigate(`route${target}`);
    }

    // Last navigation (i=2999) → route${(2999 % 9) + 1} = route3. The in-loop
    // getRootPath() check already discriminates setRootPath; this pins the
    // committed route too. (Dropped a hard-capped heap line — rootPath is a
    // single last-write-wins scalar, ~bytes retained, structurally below any MB
    // threshold, so the old heap assert passed even if setRootPath leaked.)
    expect(router.getState()?.name).toBe("route3");

    pluginApi.setRootPath("");
  }, 30_000);

  it("S24.2: buildPath reflects rootPath after each change", () => {
    router = createStressRouter(10);
    void router.start("/route0");

    const pluginApi = getPluginApi(router);

    for (let i = 0; i < 200; i++) {
      const prefix = `/prefix${i}`;

      pluginApi.setRootPath(prefix);

      const path = router.buildPath("route1");

      expect(path).toBe(`${prefix}/route1`);
    }

    pluginApi.setRootPath("");
  }, 30_000);
});
