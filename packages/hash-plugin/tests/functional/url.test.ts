import { createRouter } from "@real-router/core";
import { hashPluginFactory } from "@real-router/hash-plugin";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  noop,
  routerConfig,
  withoutMeta,
  createMockedBrowser,
} from "../helpers/testUtils";

import type { Browser } from "../../src/browser-env/index.js";
import type { Router } from "@real-router/core";

let router: Router;
let mockedBrowser: Browser;

describe("Hash Plugin — URL Operations", () => {
  beforeEach(() => {
    mockedBrowser = createMockedBrowser(noop);
    globalThis.history.replaceState({}, "", "/");

    router = createRouter(routerConfig, {
      defaultRoute: "home",
      queryParamsMode: "default",
    });
  });

  afterEach(() => {
    router.stop();
  });

  describe("Core URL Operations", () => {
    describe("buildUrl", () => {
      it("builds hash URL without base or prefix", () => {
        router.usePlugin(hashPluginFactory({}, mockedBrowser));

        expect(router.buildUrl("home", {})).toBe("#/home");
        expect(router.buildUrl("users.view", { id: "123" })).toBe(
          "#/users/view/123",
        );
      });

      it("builds URL with hashPrefix", () => {
        router.usePlugin(
          hashPluginFactory(
            { hashPrefix: "!" },
            createMockedBrowser(noop, "!"),
          ),
        );

        expect(router.buildUrl("home", {})).toBe("#!/home");
        expect(router.buildUrl("users.list", {})).toBe("#!/users/list");
      });

      it("builds URL with base path", () => {
        router.usePlugin(hashPluginFactory({ base: "/app" }, mockedBrowser));

        expect(router.buildUrl("home", {})).toBe("/app#/home");
        expect(router.buildUrl("users.list", {})).toBe("/app#/users/list");
      });

      it("builds URL with base and hashPrefix", () => {
        router.usePlugin(
          hashPluginFactory(
            { base: "/app", hashPrefix: "!" },
            createMockedBrowser(noop, "!"),
          ),
        );

        expect(router.buildUrl("home", {})).toBe("/app#!/home");
      });
    });

    describe("matchUrl", () => {
      beforeEach(() => {
        router.usePlugin(hashPluginFactory({}, mockedBrowser));
      });

      it("matches URL with hash fragment", () => {
        const state = router.matchUrl("https://example.com/#/users/list");

        expect(withoutMeta(state!)).toStrictEqual({
          name: "users.list",
          params: {},
          path: "/users/list",
        });
      });

      it("matches URL with hash and params", () => {
        const state = router.matchUrl("https://example.com/#/users/view/42");

        expect(withoutMeta(state!)).toStrictEqual({
          name: "users.view",
          params: { id: "42" },
          path: "/users/view/42",
        });
      });

      it("matches URL with search params", () => {
        const state = router.matchUrl(
          "https://example.com/#/users/list?page=1&sort=asc",
        );

        expect(withoutMeta(state!)).toStrictEqual({
          name: "users.list",
          params: { page: 1, sort: "asc" },
          path: "/users/list",
        });
      });

      it("returns undefined for invalid protocol", () => {
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);
        const state = router.matchUrl("file:///home/user/file.html");

        expect(state).toBeUndefined();
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Invalid URL protocol"),
        );

        consoleSpy.mockRestore();
      });

      it("returns undefined when hash does not match any route", () => {
        const state = router.matchUrl("https://example.com/#/nonexistent-path");

        expect(state).toBeUndefined();
      });
    });

    describe("matchUrl with hashPrefix", () => {
      it("matches URL with hashPrefix", () => {
        router.usePlugin(
          hashPluginFactory(
            { hashPrefix: "!" },
            createMockedBrowser(noop, "!"),
          ),
        );

        const state = router.matchUrl("https://example.com/#!/users/list");

        expect(withoutMeta(state!)).toStrictEqual({
          name: "users.list",
          params: {},
          path: "/users/list",
        });
      });

      it("reuses pre-computed regexp on repeated matchUrl calls", () => {
        router.usePlugin(
          hashPluginFactory(
            { hashPrefix: "!" },
            createMockedBrowser(noop, "!"),
          ),
        );

        const first = router.matchUrl("https://example.com/#!/home");
        const second = router.matchUrl("https://example.com/#!/users/list");

        expect(first!.name).toBe("home");
        expect(second!.name).toBe("users.list");
      });
    });
  });

  describe("URL Encoding Edge Cases", () => {
    beforeEach(() => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
    });

    it("handles spaces in route params (%20)", () => {
      const url = router.buildUrl("users.view", { id: "John Doe" });
      const state = router.matchUrl(`https://example.com${url}`);

      expect(state).toBeDefined();
      expect(state!.params.id).toBe("John Doe");
    });

    it("handles double-encoded params (%2520)", () => {
      // Input is literal "hello%20world" — route-node treats input as literal text
      const url = router.buildUrl("users.view", { id: "hello%20world" });
      const state = router.matchUrl(`https://example.com${url}`);

      expect(state).toBeDefined();
      // The input is treated as literal text, so double-encoding occurs
      expect(state!.params.id).toBe("hello%20world");
    });

    it("handles special characters in params (@, +, =)", () => {
      const testCases = [
        { id: "user@domain.com", label: "@" },
        { id: "a+b", label: "+" },
        { id: "key=value", label: "=" },
      ];

      for (const { id } of testCases) {
        const url = router.buildUrl("users.view", { id });
        const state = router.matchUrl(`https://example.com${url}`);

        expect(state).toBeDefined();
        expect(state!.params.id).toBe(id);
      }
    });
  });

  describe("Base Path Normalization", () => {
    it("normalizes base without leading slash", () => {
      router.usePlugin(hashPluginFactory({ base: "app" }, mockedBrowser));

      expect(router.buildUrl("home", {})).toBe("/app#/home");
    });

    it("normalizes base with trailing slash", () => {
      router.usePlugin(hashPluginFactory({ base: "/app/" }, mockedBrowser));

      expect(router.buildUrl("home", {})).toBe("/app#/home");
    });

    it("normalizes base with both issues", () => {
      router.usePlugin(hashPluginFactory({ base: "app/" }, mockedBrowser));

      expect(router.buildUrl("home", {})).toBe("/app#/home");
    });

    it("handles empty base", () => {
      router.usePlugin(hashPluginFactory({ base: "" }, mockedBrowser));

      expect(router.buildUrl("home", {})).toBe("#/home");
    });

    it("matches URL with base path", () => {
      router.usePlugin(hashPluginFactory({ base: "/app" }, mockedBrowser));

      const state = router.matchUrl("https://example.com/app#/users/list");

      expect(withoutMeta(state!)).toStrictEqual({
        name: "users.list",
        params: {},
        path: "/users/list",
      });
    });
  });
});
