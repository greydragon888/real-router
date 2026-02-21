import { describe, it, expect, vi } from "vitest";

import { RouterError } from "@real-router/core";

import { executeLifecycleHooks } from "../../../src/namespaces/NavigationNamespace/transition/executeLifecycleHooks";

import type { State, GuardFn } from "@real-router/types";

describe("transition/executeLifecycleHooks", () => {
  const createState = (name: string): State => ({
    name,
    params: {},
    path: `/${name}`,
    meta: { id: 1, params: {}, options: {} },
  });

  describe("empty segments", () => {
    it("should resolve immediately when no segments to process", async () => {
      const toState = createState("users");
      const fromState = createState("home");
      const hooks = new Map<string, GuardFn>();

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          [],
          "CANNOT_DEACTIVATE",
          () => false,
        ),
      ).resolves.toBeUndefined();
    });

    it("should resolve immediately when hooks map has no matching segments", async () => {
      const toState = createState("users");
      const fromState = createState("home");
      const hooks = new Map<string, GuardFn>([["admin", () => true]]);

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users"],
          "CANNOT_ACTIVATE",
          () => false,
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe("guard returning true", () => {
    it("should resolve when all guards return true", async () => {
      const toState = createState("users");
      const fromState = createState("home");
      const allowHook: GuardFn = () => true;
      const hooks = new Map<string, GuardFn>([["users", allowHook]]);

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users"],
          "CANNOT_ACTIVATE",
          () => false,
        ),
      ).resolves.toBeUndefined();
    });

    it("should resolve when guard returns Promise<true>", async () => {
      const toState = createState("users");
      const fromState = createState("home");
      const asyncAllowHook: GuardFn = () => Promise.resolve(true);
      const hooks = new Map<string, GuardFn>([["users", asyncAllowHook]]);

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users"],
          "CANNOT_ACTIVATE",
          () => false,
        ),
      ).resolves.toBeUndefined();
    });

    it("should process multiple segments when all return true", async () => {
      const toState = createState("users.list");
      const fromState = createState("home");
      const hooks = new Map<string, GuardFn>([
        ["users", () => true],
        ["users.list", () => true],
      ]);

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users", "users.list"],
          "CANNOT_ACTIVATE",
          () => false,
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe("guard returning non-true (blocked)", () => {
    it("should throw errorCode when guard returns false", async () => {
      const toState = createState("users");
      const fromState = createState("home");
      const blockHook: GuardFn = () => false;
      const hooks = new Map<string, GuardFn>([["users", blockHook]]);

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users"],
          "CANNOT_ACTIVATE",
          () => false,
        ),
      ).rejects.toThrowError(RouterError);
    });

    it("should throw errorCode when guard returns Promise<false>", async () => {
      const toState = createState("users");
      const fromState = createState("home");
      const asyncBlockHook: GuardFn = () => Promise.resolve(false);
      const hooks = new Map<string, GuardFn>([["users", asyncBlockHook]]);

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users"],
          "CANNOT_ACTIVATE",
          () => false,
        ),
      ).rejects.toThrowError(RouterError);
    });
  });

  describe("guard throwing errors", () => {
    it("should rethrow RouterError thrown by guard with errorCode", async () => {
      const toState = createState("users");
      const fromState = createState("home");
      const rejectHook: GuardFn = () => {
        throw new RouterError("CANNOT_ACTIVATE");
      };
      const hooks = new Map<string, GuardFn>([["users", rejectHook]]);

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users"],
          "CANNOT_ACTIVATE",
          () => false,
        ),
      ).rejects.toThrowError(RouterError);
    });

    it("should wrap non-RouterError thrown by guard", async () => {
      const toState = createState("users");
      const fromState = createState("home");
      const errorHook: GuardFn = () => {
        throw new Error("something went wrong");
      };
      const hooks = new Map<string, GuardFn>([["users", errorHook]]);

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users"],
          "CANNOT_ACTIVATE",
          () => false,
        ),
      ).rejects.toThrowError(RouterError);
    });
  });

  describe("multiple segments with failure", () => {
    it("should not call second hook when first hook returns false", async () => {
      const toState = createState("users.list");
      const fromState = createState("home");
      const secondHookImpl: GuardFn = () => true;
      const secondHook = vi.fn(secondHookImpl);
      const hooks = new Map<string, GuardFn>([
        ["users", () => false],
        ["users.list", secondHook],
      ]);

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users", "users.list"],
          "CANNOT_ACTIVATE",
          () => false,
        ),
      ).rejects.toThrowError(RouterError);

      expect(secondHook).not.toHaveBeenCalled();
    });
  });

  describe("fromState is undefined", () => {
    it("should work correctly on initial navigation (fromState = undefined)", async () => {
      const toState = createState("home");
      const allowHook: GuardFn = () => true;
      const hooks = new Map<string, GuardFn>([["home", allowHook]]);

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          undefined,
          ["home"],
          "CANNOT_ACTIVATE",
          () => false,
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe("cancellation between segments", () => {
    it("should throw TRANSITION_CANCELLED when cancelled before first hook", async () => {
      const toState = createState("users");
      const fromState = createState("home");
      const hooks = new Map<string, GuardFn>([["users", () => true]]);

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users"],
          "CANNOT_ACTIVATE",
          () => true,
        ),
      ).rejects.toThrowError("CANCELLED");
    });

    it("should throw TRANSITION_CANCELLED when cancelled between hook executions", async () => {
      const toState = createState("users.list");
      const fromState = createState("home");

      let cancelled = false;

      const firstHook: GuardFn = () => {
        cancelled = true;

        return true;
      };

      const secondHook: GuardFn = () => true;

      const hooks = new Map<string, GuardFn>([
        ["users", firstHook],
        ["users.list", secondHook],
      ]);

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users", "users.list"],
          "CANNOT_ACTIVATE",
          () => cancelled,
        ),
      ).rejects.toThrowError("CANCELLED");
    });
  });
});
