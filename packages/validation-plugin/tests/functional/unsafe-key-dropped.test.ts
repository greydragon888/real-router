import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { validationPlugin } from "../../src";

import type { Router } from "@real-router/core";
import type { MockInstance } from "vitest";

/**
 * The unsafe-key diagnostic (#1792) — an own `__proto__` dropped off a URL.
 *
 * ⚠ Only the WIRE reaches this. A caller's own bag carrying that key is refused
 * by CORE with a `TypeError`, plugin or no plugin, because the caller wrote the
 * name. A URL is not the caller's code and `match()` must never throw on input
 * (#737), so there the key is dropped — bare core silently, this plugin out
 * loud. Same always-on-fixes / opt-in-diagnoses split as the mode gate (#1575).
 */
const ROUTES = [
  { name: "h", path: "/h" },
  { name: "q", path: "/q?__proto__&a" },
];

let router: Router;
let warnSpy: MockInstance<(...args: unknown[]) => void>;

function mk(): Router {
  const instance = createRouter(ROUTES);

  instance.usePlugin(validationPlugin());

  return instance;
}

describe("validation-plugin — unsafe key dropped off a URL (#1792)", () => {
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    router.stop();
  });

  it("warns, naming the route and the key, and does not throw", async () => {
    router = mk();
    await router.start("/h");

    expect(() =>
      getPluginApi(router).matchPath("/q?a=1&__proto__=V"),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`"__proto__"`),
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(`"q"`));
  });

  it("the key really is gone from the state, not merely reported", async () => {
    router = mk();
    await router.start("/h");

    const matched = getPluginApi(router).matchPath("/q?a=1&__proto__=V");

    // The ordinary key is the control: the drop is about ONE name, not about
    // the URL failing to parse.
    expect(Object.getOwnPropertyNames(matched!.search)).toStrictEqual(["a"]);
  });

  it("says it once per route+key, and per ROUTER (#1583)", async () => {
    router = mk();
    await router.start("/h");

    const api = getPluginApi(router);

    api.matchPath("/q?a=1&__proto__=V");
    api.matchPath("/q?a=2&__proto__=W");

    expect(warnSpy).toHaveBeenCalledTimes(1);

    // A second router starts with its own de-dup set — the #1583 lesson: a
    // module-level cache silenced every router after the first, which is
    // backwards for a dev-time signal under SSR.
    const second = mk();

    await second.start("/h");
    getPluginApi(second).matchPath("/q?a=1&__proto__=V");

    expect(warnSpy).toHaveBeenCalledTimes(2);

    second.stop();
  });

  it("CONTROL — an ordinary key is never reported", async () => {
    router = mk();
    await router.start("/h");

    getPluginApi(router).matchPath("/q?a=1");

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
