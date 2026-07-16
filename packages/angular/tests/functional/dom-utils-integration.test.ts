import { createRouter } from "@real-router/core";
import { describe, it, expect } from "vitest";

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

    const calls: [string, object | undefined, object | undefined][] = [];
    const navigateSpy = (
      name: string,
      params?: object,
      opts?: object,
    ): Promise<unknown> => {
      calls.push([name, params, opts]);

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
    expect(calls[0]?.[2]).toMatchObject({
      hash: "new",
      force: true,
      hashChange: true,
    });

    router.stop();
  });

  it("navigateWithHash: same route + same hash does not force (#532)", async () => {
    const router = createRouter([{ name: "home", path: "/" }]);

    await router.start("/");

    const calls: [string, object | undefined, object | undefined][] = [];

    (
      router as unknown as {
        navigate: (...args: unknown[]) => Promise<unknown>;
      }
    ).navigate = (...args) => {
      calls.push(args as [string, object | undefined, object | undefined]);

      return Promise.resolve(router.getState()!);
    };
    (router as unknown as { getState: () => unknown }).getState = () => ({
      name: "home",
      params: {},
      path: "/",
      context: { url: { hash: "x", hashChanged: false } },
    });

    await navigateWithHash(router, "home", {}, "x");

    expect(calls[0]?.[2]).not.toMatchObject({ force: true });

    router.stop();
  });

  it("navigateWithHash: different route does not force (#532)", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ]);

    await router.start("/");

    const calls: [string, object | undefined, object | undefined][] = [];

    (
      router as unknown as {
        navigate: (...args: unknown[]) => Promise<unknown>;
      }
    ).navigate = (...args) => {
      calls.push(args as [string, object | undefined, object | undefined]);

      return Promise.resolve(router.getState()!);
    };

    await navigateWithHash(router, "users", {}, "anchor");

    expect(calls[0]?.[2]).toMatchObject({ hash: "anchor" });
    expect(calls[0]?.[2]).not.toMatchObject({ force: true });

    router.stop();
  });

  it("navigateWithHash: hash undefined preserves existing hash via empty change detection (#532)", async () => {
    const router = createRouter([{ name: "home", path: "/" }]);

    await router.start("/");

    const calls: [string, object | undefined, object | undefined][] = [];

    (
      router as unknown as {
        navigate: (...args: unknown[]) => Promise<unknown>;
      }
    ).navigate = (...args) => {
      calls.push(args as [string, object | undefined, object | undefined]);

      return Promise.resolve(router.getState()!);
    };

    await navigateWithHash(router, "home", {}, undefined);

    // hash undefined → opts.hash not set
    expect(calls[0]?.[2]).not.toHaveProperty("hash");

    router.stop();
  });
});
