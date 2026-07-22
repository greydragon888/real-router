import { createRouter } from "@real-router/core";
import { describe, it, expect, vi } from "vitest";

import {
  buildHref,
  navigateWithHash,
  shallowEqual,
  shouldNavigate,
} from "../../src/dom-utils";

describe("dom-utils integration (copy from shared/)", () => {
  it("buildHref returns correct path after prebundle copy", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ]);

    await router.start("/");

    expect(buildHref(router, "home", {})).toBe("/");

    router.stop();
  });

  it("buildHref passes the normalized hash into router.buildUrl when present", () => {
    const buildUrl = vi.fn(() => "/users?x=1#sec");
    const urlRouter = {
      buildUrl,
      buildPath: () => "/users",
    } as unknown as Parameters<typeof buildHref>[0];

    expect(buildHref(urlRouter, "users", {}, "#sec")).toBe("/users?x=1#sec");
    expect(buildUrl).toHaveBeenCalledWith("users", {}, undefined, {
      hash: "sec",
    });
  });

  it("buildHref guards empty-string and non-string buildPath results (defensive arm)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      // No `buildUrl` on either stub — the call goes straight to `buildPath`.
      const emptyRouter = {
        buildPath: () => "",
      } as unknown as Parameters<typeof buildHref>[0];

      expect(buildHref(emptyRouter, "broken", {})).toBeUndefined();

      const nonStringRouter = {
        buildPath: () => null,
      } as unknown as Parameters<typeof buildHref>[0];

      expect(buildHref(nonStringRouter, "broken", {})).toBeUndefined();

      expect(errorSpy).toHaveBeenCalledTimes(2);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("shouldNavigate rejects modified clicks", () => {
    const event = {
      button: 0,
      metaKey: true,
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
    } as MouseEvent;

    expect(shouldNavigate(event)).toBe(false);
  });

  it("shouldNavigate accepts clean left-click", () => {
    const event = {
      button: 0,
      metaKey: false,
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
    } as MouseEvent;

    expect(shouldNavigate(event)).toBe(true);
  });

  it("shallowEqual: identical reference, both undefined, and mismatched key sets", () => {
    const ref = { id: "1" };

    expect(shallowEqual(ref, ref)).toBe(true);
    expect(shallowEqual(undefined, undefined)).toBe(true);
    expect(shallowEqual(undefined, { id: "1" })).toBe(false);
    expect(shallowEqual({ id: "1" }, undefined)).toBe(false);
    expect(shallowEqual({ id: "1" }, { id: "1", extra: "x" })).toBe(false);
  });

  it("shallowEqual: per-key Object.is comparison is order-insensitive", () => {
    expect(shallowEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(shallowEqual({ id: "1" }, { id: "2" })).toBe(false);
    expect(shallowEqual({ id: 1n }, { id: 1n })).toBe(true);
  });

  it("buildHref accepts hash option and falls back to buildPath append (#532)", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ]);

    await router.start("/");

    expect(buildHref(router, "users", {}, "anchor")).toBe("/users#anchor");
    expect(buildHref(router, "users", {}, "")).toBe("/users");
    expect(buildHref(router, "users", {}, "#anchor")).toBe("/users#anchor");
    expect(buildHref(router, "users", {}, "a b&c#d")).toBe(
      "/users#a%20b&c%23d",
    );

    router.stop();
  });

  it("navigateWithHash: same route + different hash adds force+hashChange (#532)", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ]);

    await router.start("/");

    const calls: [
      string,
      object | undefined,
      object | undefined,
      object | undefined,
    ][] = [];
    const navigateSpy = (
      name: string,
      params?: object,
      search?: object,
      opts?: object,
    ): Promise<unknown> => {
      // Slot-shift (RFC-4 M2 / #1548): query channel at position 3, opts at 4.
      calls.push([name, params, search, opts]);

      return Promise.resolve(router.getState()!);
    };

    (router as unknown as { navigate: typeof navigateSpy }).navigate =
      navigateSpy;
    (router as unknown as { getState: () => unknown }).getState = () => ({
      name: "home",
      params: {},
      path: "/",
      context: { url: { hash: "old", hashChanged: false } },
    });

    await navigateWithHash(router, "home", {}, "new");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("home");
    expect(calls[0]?.[3]).toMatchObject({
      hash: "new",
      force: true,
      hashChange: true,
    });

    router.stop();
  });

  it("navigateWithHash: same route + same hash does not force (#532)", async () => {
    const router = createRouter([{ name: "home", path: "/" }]);

    await router.start("/");

    const calls: [
      string,
      object | undefined,
      object | undefined,
      object | undefined,
    ][] = [];

    (
      router as unknown as {
        navigate: (...args: unknown[]) => Promise<unknown>;
      }
    ).navigate = (...args) => {
      calls.push(
        args as [
          string,
          object | undefined,
          object | undefined,
          object | undefined,
        ],
      );

      return Promise.resolve(router.getState()!);
    };
    (router as unknown as { getState: () => unknown }).getState = () => ({
      name: "home",
      params: {},
      path: "/",
      context: { url: { hash: "x", hashChanged: false } },
    });

    await navigateWithHash(router, "home", {}, "x");

    expect(calls[0]?.[3]).not.toMatchObject({ force: true });

    router.stop();
  });

  it("navigateWithHash: different route does not force (#532)", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ]);

    await router.start("/");

    const calls: [
      string,
      object | undefined,
      object | undefined,
      object | undefined,
    ][] = [];

    (
      router as unknown as {
        navigate: (...args: unknown[]) => Promise<unknown>;
      }
    ).navigate = (...args) => {
      calls.push(
        args as [
          string,
          object | undefined,
          object | undefined,
          object | undefined,
        ],
      );

      return Promise.resolve(router.getState()!);
    };

    await navigateWithHash(router, "users", {}, "anchor");

    expect(calls[0]?.[3]).toMatchObject({ hash: "anchor" });
    expect(calls[0]?.[3]).not.toMatchObject({ force: true });

    router.stop();
  });

  it("navigateWithHash: hash undefined preserves existing hash via empty change detection (#532)", async () => {
    const router = createRouter([{ name: "home", path: "/" }]);

    await router.start("/");

    const calls: [
      string,
      object | undefined,
      object | undefined,
      object | undefined,
    ][] = [];

    (
      router as unknown as {
        navigate: (...args: unknown[]) => Promise<unknown>;
      }
    ).navigate = (...args) => {
      calls.push(
        args as [
          string,
          object | undefined,
          object | undefined,
          object | undefined,
        ],
      );

      return Promise.resolve(router.getState()!);
    };

    await navigateWithHash(router, "home", {}, undefined);

    // hash undefined → opts.hash not set
    expect(calls[0]?.[3]).not.toHaveProperty("hash");

    router.stop();
  });
});
