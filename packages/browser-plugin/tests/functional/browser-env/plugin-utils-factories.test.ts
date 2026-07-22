import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  createStartInterceptor,
  createPluginBuildUrl,
  createReplaceHistoryState,
} from "../../../src/browser-env";

import type { ReplaceStateBrowser } from "../../../src/browser-env";
import type { Router } from "@real-router/core";

describe("plugin-utils factories", () => {
  let router: Router;

  beforeEach(() => {
    router = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users/:id" },
      { name: "list", path: "/list?tab&sort" },
    ]);
  });

  afterEach(() => {
    router.stop();
  });

  describe("createStartInterceptor", () => {
    it("substitutes browser.getLocation() when start() is called without a path", async () => {
      const api = getPluginApi(router);

      createStartInterceptor(api, { getLocation: () => "/users/7" });

      // Router.start types the path as required, but plugins rely on the
      // pathless runtime call — that is exactly what the interceptor serves.
      await (router as { start: (path?: string) => Promise<unknown> }).start();

      expect(router.getState()).toMatchObject({
        name: "users",
        params: { id: "7" },
      });
    });

    it("passes an explicit start path through untouched", async () => {
      const api = getPluginApi(router);
      const getLocation = vi.fn(() => "/users/7");

      createStartInterceptor(api, { getLocation });

      await router.start("/");

      expect(router.getState()).toMatchObject({ name: "home" });
      expect(getLocation).not.toHaveBeenCalled();
    });
  });

  describe("createPluginBuildUrl", () => {
    it("builds a bare URL when no hash option is given", () => {
      const buildUrl = createPluginBuildUrl(router, "/app");

      expect(buildUrl("users", { id: "1" })).toBe("/app/users/1");
    });

    it("appends an encoded fragment for a non-empty hash", () => {
      const buildUrl = createPluginBuildUrl(router, "");

      expect(
        buildUrl("users", { id: "1" }, undefined, { hash: "sec one" }),
      ).toBe("/users/1#sec%20one");
    });

    it("normalizes a '#'-prefixed hash before encoding", () => {
      const buildUrl = createPluginBuildUrl(router, "");

      expect(buildUrl("users", { id: "1" }, undefined, { hash: "#sec" })).toBe(
        "/users/1#sec",
      );
    });

    it("omits the fragment for an explicitly empty hash", () => {
      const buildUrl = createPluginBuildUrl(router, "");

      expect(buildUrl("users", { id: "1" }, undefined, { hash: "" })).toBe(
        "/users/1",
      );
    });
  });

  describe("createReplaceHistoryState", () => {
    let browser: ReplaceStateBrowser & {
      replaceState: ReturnType<typeof vi.fn>;
      getHash: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      browser = {
        replaceState: vi.fn((_state: unknown, _url: string) => {}),
        getHash: vi.fn(() => "#current"),
      };
    });

    function makeReplace(preserveHash?: boolean) {
      const api = getPluginApi(router);

      return createReplaceHistoryState(
        api,
        router,
        browser,
        (name, params, search) =>
          createPluginBuildUrl(router, "")(name, params, search),
        preserveHash,
      );
    }

    it("throws for an unknown route name", () => {
      const replace = makeReplace();

      expect(() => {
        replace("nope");
      }).toThrow('route "nope" is not found');
    });

    it("preserves the current browser hash by default (legacy tri-state arm)", () => {
      const replace = makeReplace();

      replace("users", { id: "1" });

      expect(browser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users", path: "/users/1" }),
        "/users/1#current",
      );
    });

    it("drops the hash when preserveHash is false (hash-plugin mode)", () => {
      const replace = makeReplace(false);

      replace("users", { id: "1" });

      expect(browser.replaceState).toHaveBeenCalledWith(
        expect.anything(),
        "/users/1",
      );
      expect(browser.getHash).not.toHaveBeenCalled();
    });

    it("sets an explicit hash, encoded", () => {
      const replace = makeReplace();

      replace("users", { id: "1" }, undefined, { hash: "sec one" });

      expect(browser.replaceState).toHaveBeenCalledWith(
        expect.anything(),
        "/users/1#sec%20one",
      );
    });

    it("clears the fragment for an explicitly empty hash", () => {
      const replace = makeReplace();

      replace("users", { id: "1" }, undefined, { hash: "" });

      expect(browser.replaceState).toHaveBeenCalledWith(
        expect.anything(),
        "/users/1",
      );
    });

    it("defaults params to {} when omitted", () => {
      const replace = makeReplace(false);

      replace("home");

      expect(browser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "home", params: {}, path: "/" }),
        "/",
      );
    });

    it("threads a caller-supplied search channel into state and URL (RFC-4 M2 / #1548)", () => {
      const replace = makeReplace(false);

      replace("list", {}, { tab: "posts" });

      // The query lands in the buffered `history.state` (dedicated `search`
      // channel, path-only `params`) AND the rebuilt URL.
      expect(browser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "list",
          params: {},
          search: { tab: "posts" },
          path: "/list?tab=posts",
        }),
        "/list?tab=posts",
      );
    });
  });
});
