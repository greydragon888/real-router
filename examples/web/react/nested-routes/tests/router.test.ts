import { createRouter } from "@real-router/core";
import { afterEach, describe, it, expect } from "vitest";

import { routes } from "../src/routes";

import type { Router } from "@real-router/core";

let router: Router;

describe("react/nested-routes — router", () => {
  afterEach(() => {
    router.stop();
  });

  describe("Nested route navigation", () => {
    it("navigates to users (parent IS the list)", async () => {
      router = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await router.start("/");

      const state = await router.navigate("users");

      expect(state.name).toBe("users");
      expect(state.path).toBe("/users");
    });

    it("navigates to users.profile with params", async () => {
      router = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await router.start("/");

      const state = await router.navigate("users.profile", { id: "2" });

      expect(state.name).toBe("users.profile");
      expect(state.params).toStrictEqual({ id: "2" });
      expect(state.path).toBe("/users/2");
    });

    it("navigates to users.profile.settings (per-user settings)", async () => {
      router = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await router.start("/");

      const state = await router.navigate("users.profile.settings", {
        id: "1",
      });

      expect(state.name).toBe("users.profile.settings");
      expect(state.params).toStrictEqual({ id: "1" });
      expect(state.path).toBe("/users/1/settings");
    });
  });

  describe("/users matches the parent (no forwardTo)", () => {
    it("/users settles on `users` directly — parent IS the list", async () => {
      router = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await router.start("/users");

      expect(router.getState()?.name).toBe("users");
      expect(router.getState()?.path).toBe("/users");
    });
  });
});
