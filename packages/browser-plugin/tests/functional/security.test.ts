import { createRouter } from "@real-router/core";
import {
  describe,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  it,
  expect,
} from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import { createMockedBrowser, routerConfig, noop } from "../helpers/testUtils";

import type { Browser } from "../../src/browser-env";
import type { Router, State, Unsubscribe } from "@real-router/core";

let router: Router;
let currentHistoryState: State | undefined;
let mockedBrowser: Browser;
let unsubscribe: Unsubscribe | undefined;

describe("Browser Plugin — Security", () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(async () => {
    mockedBrowser = createMockedBrowser((state) => {
      currentHistoryState = state;
    });
    globalThis.history.replaceState({}, "", "/");
    router = createRouter(routerConfig, {
      defaultRoute: "home",
      queryParamsMode: "default",
    });
    currentHistoryState = undefined;
  });

  afterEach(() => {
    router.stop();
    unsubscribe?.();
    vi.clearAllMocks();
  });

  afterAll(() => {
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  describe("Malicious popstate state handling", () => {
    beforeEach(async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("rejects popstate with invalid state structure", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);

      // Malicious state with wrong structure
      const maliciousState = {
        name: "home",
        params: {},
        // Missing 'path' - invalid state structure
      };

      const stateBefore = router.getState();

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: maliciousState }),
      );

      // Router should reject invalid state via type guard
      // State remains unchanged because invalid state is rejected
      expect(router.getState()?.name).toBe(stateBefore?.name);

      consoleSpy.mockRestore();
    });

    it("handles popstate with XSS attempt in state.name", async () => {
      // Router validates state structure and rejects invalid route names
      const xssState = {
        name: '<script>alert("xss")</script>',
        params: {},
        path: "/malicious",
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: xssState }),
      );

      // Router should not navigate to non-existent route with malicious name
      // The malicious route name doesn't exist in routerConfig, so state won't match
      expect(router.getState()?.name).not.toContain("<script>");
      expect(router.getState()?.name).toBe("index");
    });

    it("sanitizes params with special characters via URL encoding", async () => {
      // Navigate normally, which will use route-node's encoding
      await router.navigate("users.view", { id: '"><script>xss</script>' });

      const state = router.getState();

      expect(state).toBeDefined();

      // Params are stored as-is in state, but URLs are encoded
      const url = router.buildUrl("users.view", state?.params ?? {});

      // URL should be encoded (< becomes %3C, > becomes %3E)
      expect(url).toContain("%3C"); // <
      expect(url).toContain("%3E"); // >
      expect(url).not.toContain("<script>");

      // When state is pushed to history, browser history API receives encoded URL
      expect(currentHistoryState?.params.id).toBe('"><script>xss</script>');
    });

    it("rejects popstate with __proto__ pollution attempt", async () => {
      // Attempt prototype pollution via state.params
      const pollutionState = {
        name: "users.view",
        params: { id: "123", __proto__: { polluted: true } },
        path: "/users/view/123",
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: pollutionState }),
      );

      // Verify Object prototype is not polluted
      expect(({} as any).polluted).toBeUndefined();

      // Router rejects the state because params has modified prototype
      // This protects against prototype pollution attacks
      expect(router.getState()?.name).toBe("index"); // stays at initial state
    });

    it("handles popstate with constructor pollution attempt", async () => {
      // Attempt to override constructor
      const maliciousState = {
        name: "home",
        params: { constructor: { prototype: { polluted: true } } },
        path: "/home",
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: maliciousState }),
      );

      // Object prototype should not be polluted
      expect(({} as any).polluted).toBeUndefined();

      expect(router.getState()?.name).toBe("home");
    });

    it("handles popstate with deeply nested malicious objects", async () => {
      // Create deeply nested object to test deep validation
      const deeplyNested: any = { level: 1 };
      let current = deeplyNested;

      for (let i = 2; i <= 10; i++) {
        current.nested = { level: i };
        current = current.nested;
      }

      const maliciousState = {
        name: "home",
        params: { deep: deeplyNested },
        path: "/home",
      };

      // The key test: router should not crash with deeply nested objects
      expect(() => {
        globalThis.dispatchEvent(
          new PopStateEvent("popstate", { state: maliciousState }),
        );
      }).not.toThrow();

      expect(router.getState()).toBeDefined();
      expect(router.getState()?.name).toBe("home");
    });
  });

  describe("URL injection prevention", () => {
    beforeEach(async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
    });

    it("safely handles javascript: URLs — no matching route", async () => {
      const state = router.matchUrl("javascript:alert('xss')");

      expect(state).toBeUndefined();
    });

    it("safely handles data: URLs — no matching route", async () => {
      const state = router.matchUrl(
        "data:text/html,<script>alert('xss')</script>",
      );

      expect(state).toBeUndefined();
    });

    it("safely handles vbscript: URLs — no matching route", async () => {
      const state = router.matchUrl("vbscript:msgbox('xss')");

      expect(state).toBeUndefined();
    });

    it("extracts path from any scheme (desktop compat) — routing decides", async () => {
      // Post-desktop-support: http/https are no longer privileged. Tauri and
      // Electron ship custom schemes (tauri://, app://, file://) — the router
      // matches by path, not by scheme. Security comes from route matching.
      expect(router.matchUrl("http://example.com/home")).toBeDefined();
      expect(router.matchUrl("https://example.com/home")).toBeDefined();

      expect(router.matchUrl("ftp://example.com/home")).toBeDefined();
      expect(router.matchUrl("ws://example.com/home")).toBeDefined();
      expect(router.matchUrl("wss://example.com/home")).toBeDefined();
      expect(router.matchUrl("tauri://localhost/home")).toBeDefined();
      expect(router.matchUrl("app://my-app/home")).toBeDefined();

      // Opaque URIs without `://` have no path to route against.
      expect(router.matchUrl("mailto:test@example.com")).toBeUndefined();
    });

    it("handles URLs with null bytes gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);

      // URL with null byte (potential for bypassing filters).
      // URL API either sanitizes or rejects — neither should crash.
      expect(() =>
        router.matchUrl("http://example.com/home\u0000.evil"),
      ).not.toThrow();

      consoleSpy.mockRestore();
    });

    it("handles URL homograph attacks (Unicode lookalikes) without throwing", async () => {
      // Using Cyrillic 'а' (U+0430) instead of Latin 'a' (U+0061)
      // This is a real security concern for phishing — but matchUrl only needs to not throw.
      expect(() =>
        router.matchUrl("https://exаmple.com/users/list"),
      ).not.toThrow();
    });

    it("prevents URL parameter injection via specially crafted URLs", async () => {
      // Try to inject parameters via URL tricks
      const state = router.matchUrl(
        "http://example.com/users/list?fake=1&admin=true#/../../secret",
      );

      // Either the URL doesn't match (secure), or if it matches, no path traversal occurred
      /* eslint-disable vitest/no-conditional-in-test, vitest/no-conditional-expect */
      if (state) {
        // If it matches, verify no path traversal occurred
        expect(state.path).not.toContain("..");
        expect(state.path).not.toContain("secret");
      } else {
        // URL didn't match - this is also acceptable (secure behavior)
        expect(state).toBeUndefined();
      }
      /* eslint-enable vitest/no-conditional-in-test, vitest/no-conditional-expect */
    });

    it("handles extremely long URLs without DoS", async () => {
      // Create very long URL (potential DoS vector)
      const longPath = `/users/view/${"a".repeat(10_000)}`;
      const longUrl = `https://example.com${longPath}`;

      const startTime = Date.now();
      const state = router.matchUrl(longUrl);
      const duration = Date.now() - startTime;

      // Should complete quickly (< 100ms) even with long URL
      expect(duration).toBeLessThan(100);

      // The dynamic segment is unconstrained, so the route matches.
      expect(state).toBeDefined();
      expect(state?.name).toBe("users.view");
      expect(state?.params.id).toBe("a".repeat(10_000));
    });
  });

  describe("Input validation edge cases", () => {
    beforeEach(async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("handles navigation with circular reference in params", async () => {
      const circularParams: any = { id: "123" };

      circularParams.self = circularParams; // Circular reference

      const state = await router.navigate("users.view", circularParams);

      expect(state.name).toBe("users.view");
    });

    it("handles params with function values", async () => {
      const maliciousParams = {
        id: "123",
        // Test edge case: function in params (intentionally unused in URL)
        evil: function () {
          return "malicious";
        },
      };

      // Router should handle or reject function in params without crashing.
      // The function value lives in the `evil` field which is not part of
      // the route path, so buildUrl ignores it entirely.
      const result = router.buildUrl("users.view", maliciousParams as any);

      expect(result).toBe("/users/view/123");
    });

    it("handles params with symbol values", async () => {
      const symbolParam = {
        id: "123",
        sym: Symbol("test"),
      };

      // Symbols in non-path params are ignored — buildUrl only consumes
      // string-coercible values for the declared path segments.
      const result = router.buildUrl("users.view", symbolParam as any);

      expect(result).toBe("/users/view/123");
    });
  });
});
