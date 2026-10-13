import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { hashPluginFactory } from "@real-router/hash-plugin";

import { createSafeBrowser } from "../../src/browser-env";
import { buildHashLocation } from "../../src/hash-utils";
import { routerConfig } from "../helpers/testUtils";

import type { Browser } from "../../src/browser-env";
import type { Router } from "@real-router/core";

/**
 * jsdom's own history, with the states cloned as a browser clones them —
 * jsdom keeps the object the plugin passes, and the plugin reuses buffers.
 */
function createCloningBrowser(): Browser {
  const browser = createSafeBrowser(
    () =>
      buildHashLocation(
        globalThis.location.hash,
        globalThis.location.search,
        null,
      ),
    "hash-plugin",
  );

  return {
    ...browser,
    pushState: (state, url) => {
      browser.pushState(structuredClone(state), url);
    },
    replaceState: (state, url) => {
      browser.replaceState(structuredClone(state), url);
    },
  };
}

// The traversal, the transition and the plugin's own return each take a task.
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

let router: Router | undefined;
let started: string[];
let errors: string[];

/**
 * Starts a router on `#/home`, behind two sentinel entries: a traversal of up
 * to two steps past the test's own entries lands on one of them.
 */
async function setup(options: { before?: string[] } = {}): Promise<Router> {
  globalThis.history.replaceState(null, "", "/#/sentinel");
  globalThis.history.pushState(null, "", "/#/sentinel");

  for (const url of options.before ?? []) {
    globalThis.history.pushState(null, "", url);
  }

  globalThis.history.pushState(null, "", "/#/home");
  started = [];
  errors = [];

  const created = createRouter(routerConfig, { defaultRoute: "home" });

  created.usePlugin(hashPluginFactory({}, createCloningBrowser()), () => ({
    onTransitionStart: (toState) => {
      started.push(toState.name);
    },
    onTransitionError: (_toState, _fromState, error) => {
      errors.push(error.code);
    },
  }));
  await created.start();
  router = created;

  return created;
}

const at = (): { path: string; route: string | undefined } => ({
  path: globalThis.location.hash.slice(1),
  route: router?.getState()?.name,
});

/** A guard that refuses to leave `name` until `allow()` is called. */
function refuseLeaving(target: Router, name: string): { allow: () => void } {
  let refusing = true;

  getLifecycleApi(target).addDeactivateGuard(name, () => () => !refusing);

  return {
    allow: () => {
      refusing = false;
    },
  };
}

describe("a traversal the router refuses returns to the entry it started from (#2740)", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("Back refused, and the page left behind is still one Back away", async () => {
    const r = await setup();

    await r.navigate("users.view", { id: "42" });
    const guard = refuseLeaving(r, "users.view");

    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/users/view/42", route: "users.view" });

    guard.allow();
    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/home", route: "home" });
  });

  it("Forward refused, and the page ahead is still one Forward away", async () => {
    const r = await setup();

    await r.navigate("users.view", { id: "42" });
    globalThis.history.back();
    await settle();
    const guard = refuseLeaving(r, "home");

    globalThis.history.forward();
    await settle();

    expect(at()).toStrictEqual({ path: "/home", route: "home" });

    guard.allow();
    globalThis.history.forward();
    await settle();

    expect(at()).toStrictEqual({ path: "/users/view/42", route: "users.view" });
  });

  it("a two-step traversal refused", async () => {
    const r = await setup();

    await r.navigate("users.list");
    await r.navigate("users.view", { id: "42" });
    const guard = refuseLeaving(r, "users.view");

    globalThis.history.go(-2);
    await settle();

    expect(at()).toStrictEqual({ path: "/users/view/42", route: "users.view" });

    guard.allow();
    globalThis.history.go(-2);
    await settle();

    expect(at()).toStrictEqual({ path: "/home", route: "home" });
  });

  it("the return starts no transition and reports nothing", async () => {
    const r = await setup();

    await r.navigate("users.view", { id: "42" });
    refuseLeaving(r, "users.view");
    started = [];

    globalThis.history.back();
    await settle();

    expect(started).toStrictEqual(["home"]);
    expect(errors).toStrictEqual(["CANNOT_DEACTIVATE"]);
    expect(at()).toStrictEqual({ path: "/users/view/42", route: "users.view" });
  });

  it("a traversal onto the router's own state keeps the count for the next refusal", async () => {
    const r = await setup();

    await r.navigate("users.list");
    await r.navigate("home");
    globalThis.history.go(-2);
    await settle();
    refuseLeaving(r, "home");

    globalThis.history.forward();
    await settle();

    expect(at()).toStrictEqual({ path: "/home", route: "home" });

    // Back on the first #/home entry: users.list is still ahead.
    r.stop();
    globalThis.history.forward();
    await settle();

    expect(globalThis.location.hash).toBe("#/users/list");
  });

  describe("where the distance cannot be measured, the entry the browser stands on is rewritten", () => {
    it("Back to an entry other code wrote", async () => {
      const r = await setup({ before: ["/#/users/list"] });

      refuseLeaving(r, "home");

      globalThis.history.back();
      await settle();

      expect(at()).toStrictEqual({ path: "/home", route: "home" });

      // The browser stands on the rewritten entry, one step from a sentinel.
      r.stop();
      globalThis.history.back();
      await settle();

      expect(globalThis.location.hash).toBe("#/sentinel");
    });

    it("a fragment navigation the browser made — a link or `location.hash` — refused", async () => {
      const r = await setup();

      refuseLeaving(r, "home");

      globalThis.location.hash = "#/users/list";
      await settle();

      expect(at()).toStrictEqual({ path: "/home", route: "home" });

      // The browser made a new entry, and that entry is what was rewritten.
      r.stop();
      globalThis.history.back();
      await settle();

      expect(globalThis.location.hash).toBe("#/home");
    });

    it("a Back between two entries fragment navigations made, refused", async () => {
      const r = await setup();

      globalThis.location.hash = "#/users/list";
      await settle();
      globalThis.location.hash = "#/users/view/42";
      await settle();
      refuseLeaving(r, "users.view");

      globalThis.history.back();
      await settle();

      expect(at()).toStrictEqual({
        path: "/users/view/42",
        route: "users.view",
      });

      // Each of them is numbered on its own: the entry the Back reached is
      // rewritten, one step from #/home.
      r.stop();
      globalThis.history.back();
      await settle();

      expect(globalThis.location.hash).toBe("#/home");
    });
  });

  it("control: a traversal onto an entry with the router's own state stays there — SAME_STATES refuses nothing", async () => {
    const r = await setup();

    await r.navigate("users.list");
    await r.navigate("home");

    globalThis.history.go(-2);
    await settle();

    expect(at()).toStrictEqual({ path: "/home", route: "home" });

    // The browser stands on the first #/home entry: users.list is ahead.
    r.stop();
    globalThis.history.forward();
    await settle();

    expect(globalThis.location.hash).toBe("#/users/list");
  });

  it("control: an allowed Back moves the router", async () => {
    const r = await setup();

    await r.navigate("users.view", { id: "42" });

    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/home", route: "home" });
  });
});
