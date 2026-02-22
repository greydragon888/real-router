import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - TransitionMeta on state.transition", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("basic population", () => {
    it("should populate state.transition after successful navigate()", async () => {
      const state = await router.navigate("users");

      expect(state.transition).toBeDefined();
    });

    it("should set reason to 'success' after successful navigate()", async () => {
      const state = await router.navigate("users");

      expect(state.transition?.reason).toBe("success");
    });

    it("should set phase to 'activating' after successful navigate()", async () => {
      const state = await router.navigate("users");

      expect(state.transition?.phase).toBe("activating");
    });
  });

  describe("from field", () => {
    it("should set from to previous route name after navigate()", async () => {
      const state = await router.navigate("users");

      expect(state.transition?.from).toBe("home");
    });

    it("should set from to undefined after start() (no previous state)", async () => {
      const startState = router.getState();

      expect(startState?.transition?.from).toBeUndefined();
    });

    it("should update from on subsequent navigations", async () => {
      await router.navigate("users");
      const state = await router.navigate("admin.dashboard");

      expect(state.transition?.from).toBe("users");
    });
  });

  describe("segments", () => {
    it("should list activated segments in state.transition.segments.activated", async () => {
      const state = await router.navigate("admin.dashboard");

      expect(state.transition?.segments.activated).toStrictEqual([
        "admin",
        "admin.dashboard",
      ]);
    });

    it("should list deactivated segments in state.transition.segments.deactivated", async () => {
      const state = await router.navigate("admin.dashboard");

      expect(state.transition?.segments.deactivated).toStrictEqual(["home"]);
    });

    it("should set intersection to common parent segment", async () => {
      await router.navigate("users.view", { id: 1 });
      const state = await router.navigate("users.list");

      expect(state.transition?.segments.intersection).toBe("users");
    });

    it("should set intersection to empty string for completely different routes", async () => {
      const state = await router.navigate("admin.dashboard");

      expect(state.transition?.segments.intersection).toBe("");
    });

    it("should set empty deactivated array when starting fresh", async () => {
      const startState = router.getState();

      expect(startState?.transition?.segments.deactivated).toStrictEqual([]);
    });

    it("should have only activated segments when starting fresh (no deactivated)", async () => {
      const startState = router.getState();

      expect(startState?.transition?.segments.activated).toStrictEqual([
        "home",
      ]);
    });
  });

  describe("immutability", () => {
    it("should freeze state.transition", async () => {
      const state = await router.navigate("users");

      expect(Object.isFrozen(state.transition)).toBe(true);
    });

    it("should freeze state.transition.segments", async () => {
      const state = await router.navigate("users");

      expect(Object.isFrozen(state.transition?.segments)).toBe(true);
    });

    it("should freeze state.transition.segments.deactivated array", async () => {
      const state = await router.navigate("users");

      expect(Object.isFrozen(state.transition?.segments.deactivated)).toBe(
        true,
      );
    });

    it("should freeze state.transition.segments.activated array", async () => {
      const state = await router.navigate("users");

      expect(Object.isFrozen(state.transition?.segments.activated)).toBe(true);
    });
  });

  describe("blocked navigation", () => {
    it("should not update state when guard blocks navigation", async () => {
      await expect(router.navigate("admin-protected")).rejects.toThrowError();

      expect(router.getState()?.name).toBe("home");
    });

    it("should keep previous state when guard blocks", async () => {
      const homeName = router.getState()?.name;

      await router.navigate("admin-protected").catch(() => {});

      expect(router.getState()?.name).toBe(homeName);
    });
  });

  describe("getState() consistency", () => {
    it("should return state with transition via getState() after navigate()", async () => {
      await router.navigate("users");

      const state = router.getState();

      expect(state?.transition).toBeDefined();
      expect(state?.transition?.reason).toBe("success");
    });

    it("should reflect latest navigation in transition.from", async () => {
      await router.navigate("users");
      await router.navigate("admin.dashboard");

      const state = router.getState();

      expect(state?.transition?.from).toBe("users");
    });
  });
});
