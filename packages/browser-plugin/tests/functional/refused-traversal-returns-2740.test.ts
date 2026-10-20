import { createRouter, events, UNKNOWN_ROUTE } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import { createSafeBrowser } from "../../src/browser-env";
import { routerConfig } from "../helpers/testUtils";

import type { Browser } from "../../src/browser-env";
import type { Router } from "@real-router/core";

/**
 * jsdom's own history: a traversal fires `popstate` on a later task, as a
 * browser does. jsdom keeps the object a write is given where a browser
 * stores a clone, and the plugin copies what it writes (#2741), so no harness
 * stands between them.
 */
function createJsdomBrowser(): Browser {
  return createSafeBrowser(
    () => globalThis.location.pathname + globalThis.location.search,
    "browser-plugin",
  );
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
let cancelled: string[];

/**
 * Starts a router on `/home`, behind which sit two sentinel entries: a
 * traversal of up to two steps past the test's own entries lands on one
 * instead of on an earlier test's.
 */
async function setup(
  options: {
    allowNotFound?: boolean;
    before?: string[];
    browser?: Browser;
  } = {},
): Promise<Router> {
  globalThis.history.replaceState(null, "", "/sentinel");
  globalThis.history.pushState(null, "", "/sentinel");

  for (const url of options.before ?? []) {
    globalThis.history.pushState(null, "", url);
  }

  globalThis.history.pushState(null, "", "/home");
  started = [];
  errors = [];
  cancelled = [];

  const created = createRouter(routerConfig, {
    defaultRoute: "home",
    allowNotFound: options.allowNotFound ?? true,
  });

  created.usePlugin(
    browserPluginFactory({}, options.browser ?? createJsdomBrowser()),
    () => ({
      onTransitionStart: (toState) => {
        started.push(toState.name);
      },
      onTransitionError: (_toState, _fromState, error) => {
        errors.push(error.code);
      },
      onTransitionCancel: (toState) => {
        cancelled.push(toState.name);
      },
    }),
  );
  await created.start();
  router = created;

  return created;
}

const at = (): { path: string; route: string | undefined } => ({
  path: globalThis.location.pathname,
  route: router?.getState()?.name,
});

/** A guard that refuses until `allow()` is called. */
function refuse(
  target: Router,
  kind: "leave" | "enter",
  name: string,
): { allow: () => void } {
  let refusing = true;
  const lifecycle = getLifecycleApi(target);

  if (kind === "leave") {
    lifecycle.addDeactivateGuard(name, () => () => !refusing);
  } else {
    lifecycle.addActivateGuard(name, () => () => !refusing);
  }

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

  it("Back refused by canDeactivate, and the page left behind is still one Back away", async () => {
    const r = await setup();

    await r.navigate("users.view", { id: "42" });
    const guard = refuse(r, "leave", "users.view");

    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/users/view/42", route: "users.view" });

    guard.allow();
    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/home", route: "home" });
  });

  it("Back refused by canActivate", async () => {
    const r = await setup();

    await r.navigate("users.view", { id: "42" });
    const guard = refuse(r, "enter", "home");

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
    const guard = refuse(r, "leave", "home");

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
    const guard = refuse(r, "leave", "users.view");

    globalThis.history.go(-2);
    await settle();

    expect(at()).toStrictEqual({ path: "/users/view/42", route: "users.view" });

    guard.allow();
    globalThis.history.go(-2);
    await settle();

    expect(at()).toStrictEqual({ path: "/home", route: "home" });
  });

  it("a second Back while the guard decides is dropped with the first, and the guard is asked once", async () => {
    const r = await setup();
    let asked = 0;
    let answer: ((allowed: boolean) => void) | undefined;

    await r.navigate("users.list");
    await r.navigate("users.view", { id: "42" });
    // Answered by the test, not by a timer: a timer races the second Back.
    getLifecycleApi(r).addDeactivateGuard("users.view", () => () => {
      asked++;

      return new Promise<boolean>((resolve) => {
        answer = resolve;
      });
    });

    globalThis.history.back();
    await settle();
    globalThis.history.back();
    await settle();
    answer?.(false);
    await settle();

    expect(asked).toBe(1);
    expect(at()).toStrictEqual({ path: "/users/view/42", route: "users.view" });

    // The entry the second Back reached is the one a replayed event would rewrite.
    r.stop();
    globalThis.history.back();
    await settle();

    expect(globalThis.location.pathname).toBe("/users/list");

    globalThis.history.back();
    await settle();

    expect(globalThis.location.pathname).toBe("/home");
  });

  it("a refused Back after an allowed one returns to the entry the allowed one reached", async () => {
    const r = await setup();

    await r.navigate("users.list");
    await r.navigate("users.view", { id: "42" });
    globalThis.history.back();
    await settle();
    refuse(r, "leave", "users.list");

    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/users/list", route: "users.list" });

    r.stop();
    globalThis.history.back();
    await settle();

    expect(globalThis.location.pathname).toBe("/home");
  });

  it("a plugin started on an entry an earlier one numbered continues its numbering, as after a reload", async () => {
    const first = await setup();

    await first.navigate("users.list");
    await first.navigate("users.view", { id: "42" });
    first.stop();

    const again = createRouter(routerConfig, {
      defaultRoute: "home",
      allowNotFound: true,
    });

    again.usePlugin(browserPluginFactory({}, createJsdomBrowser()));
    await again.start();
    router = again;
    refuse(again, "leave", "users.view");

    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/users/view/42", route: "users.view" });

    again.stop();
    globalThis.history.back();
    await settle();

    expect(globalThis.location.pathname).toBe("/users/list");
  });

  it("a critical error during a traversal returns to the entry it started from", async () => {
    const r = await setup();

    await r.navigate("users.view", { id: "42" });
    r.subscribeLeave(() => {
      throw new TypeError("crash");
    });

    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/users/view/42", route: "users.view" });

    r.stop();
    globalThis.history.back();
    await settle();

    expect(globalThis.location.pathname).toBe("/home");
  });

  it("a traversal a newer navigation cancels is not a refusal: the plugin does not travel", async () => {
    const browser = createJsdomBrowser();
    let travelled = 0;
    const r = await setup({
      browser: {
        ...browser,
        go: (delta) => {
          travelled++;
          browser.go?.(delta);
        },
      },
    });
    let answer: ((allowed: boolean) => void) | undefined;

    await r.navigate("users.view", { id: "42" });
    getLifecycleApi(r).addDeactivateGuard(
      "users.view",
      () => () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );

    globalThis.history.back();
    await settle();
    const newer = r.navigate("users.list");

    answer?.(true);
    await newer;
    await settle();

    expect(cancelled).toStrictEqual(["home"]);
    expect(travelled).toBe(0);
    expect(at()).toStrictEqual({ path: "/users/list", route: "users.list" });
  });

  it("the return starts no transition and reports nothing", async () => {
    const r = await setup();

    await r.navigate("users.view", { id: "42" });
    refuse(r, "leave", "users.view");
    started = [];

    globalThis.history.back();
    await settle();

    expect(started).toStrictEqual(["home"]);
    expect(errors).toStrictEqual(["CANNOT_DEACTIVATE"]);
    expect(at()).toStrictEqual({ path: "/users/view/42", route: "users.view" });
  });

  it("a route the router keeps refusing to enter turns every Back away; go(-2) steps past it", async () => {
    const r = await setup();

    await r.navigate("users.view", { id: "42" });
    await r.navigate("users.list");
    refuse(r, "enter", "users.view");

    globalThis.history.back();
    await settle();
    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/users/list", route: "users.list" });

    globalThis.history.go(-2);
    await settle();

    expect(at()).toStrictEqual({ path: "/home", route: "home" });
  });

  it("a custom Browser written as a class starts, and its refused Back returns", async () => {
    class ClassBrowser implements Browser {
      readonly #history = globalThis.history;

      getLocation(): string {
        return globalThis.location.pathname + globalThis.location.search;
      }

      getHash(): string {
        return globalThis.location.hash;
      }

      getState(): unknown {
        return this.#history.state as unknown;
      }

      go(delta: number): void {
        this.#history.go(delta);
      }

      pushState(state: unknown, url: string): void {
        this.#history.pushState(state, "", url);
      }

      replaceState(state: unknown, url: string): void {
        this.#history.replaceState(state, "", url);
      }

      addPopstateListener(fn: (evt: PopStateEvent) => void): () => void {
        globalThis.addEventListener("popstate", fn);

        return () => {
          globalThis.removeEventListener("popstate", fn);
        };
      }

      addHashChangeListener(fn: (evt: HashChangeEvent) => void): () => void {
        globalThis.addEventListener("hashchange", fn);

        return () => {
          globalThis.removeEventListener("hashchange", fn);
        };
      }
    }

    const r = await setup({ browser: new ClassBrowser() });

    expect(at()).toStrictEqual({ path: "/home", route: "home" });

    await r.navigate("users.view", { id: "42" });
    refuse(r, "leave", "users.view");

    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/users/view/42", route: "users.view" });
  });

  it("a browser whose go throws: the entry is rewritten, and the next Back is a traversal of its own", async () => {
    const browser = createJsdomBrowser();
    const r = await setup({
      browser: {
        ...browser,
        go: () => {
          throw new DOMException("not fully active", "SecurityError");
        },
      },
    });

    await r.navigate("users.view", { id: "42" });
    const guard = refuse(r, "leave", "users.view");

    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/users/view/42", route: "users.view" });

    guard.allow();
    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/sentinel", route: UNKNOWN_ROUTE });
  });

  it("a return the browser never makes: the next Back is a traversal of its own", async () => {
    const browser = createJsdomBrowser();
    const r = await setup({
      browser: {
        ...browser,
        go: () => {
          // e.g. a step of an iframe's history, which fires no popstate here
        },
      },
    });

    await r.navigate("users.view", { id: "42" });
    const guard = refuse(r, "leave", "users.view");

    globalThis.history.back();
    await settle();
    guard.allow();
    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/sentinel", route: UNKNOWN_ROUTE });
  });

  it("a redirect a TRANSITION_ERROR listener defers is not undone by the return", async () => {
    const r = await setup();

    await r.navigate("users.view", { id: "42" });
    globalThis.history.back();
    await settle();
    refuse(r, "enter", "users.view");
    getPluginApi(r).addEventListener(events.TRANSITION_ERROR, () => {
      queueMicrotask(() => {
        void r.navigate("users.list").catch(() => undefined);
      });
    });

    globalThis.history.forward();
    await settle();

    expect(at()).toStrictEqual({ path: "/users/list", route: "users.list" });
  });

  it("a redirect deferred after a refused go(-2) leaves the next Back to the user", async () => {
    const r = await setup();

    await r.navigate("users.list");
    await r.navigate("users.view", { id: "42" });
    const guard = refuse(r, "enter", "home");
    const off = getPluginApi(r).addEventListener(
      events.TRANSITION_ERROR,
      () => {
        queueMicrotask(() => {
          void r.navigate("index").catch(() => undefined);
        });
      },
    );

    globalThis.history.go(-2);
    await settle();

    expect(at()).toStrictEqual({ path: "/", route: "index" });

    off();
    guard.allow();
    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/home", route: "home" });
  });

  it("an entry router.replaceHistoryState() wrote keeps its place, and a refused Back returns to it", async () => {
    const r = await setup();

    await r.navigate("users.view", { id: "42" });
    r.replaceHistoryState("users.view", { id: "99" });
    refuse(r, "leave", "users.view");

    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/users/view/99", route: "users.view" });
  });

  it("a write during the refused transition does not move the place the return goes to", async () => {
    const r = await setup();

    await r.navigate("users.view", { id: "42" });
    // The browser stands on /home's entry while the guard runs, and the write
    // lands there.
    getLifecycleApi(r).addDeactivateGuard("users.view", () => () => {
      r.replaceHistoryState("users.list");

      return false;
    });

    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/users/view/42", route: "users.view" });

    r.stop();
    globalThis.history.back();
    await settle();

    expect(globalThis.location.pathname).toBe("/users/list");
  });

  it("a traversal between two not-found entries of one path moves the entry the return goes to", async () => {
    const r = await setup();

    await r.navigate("users.list");
    await r.navigate("users.view", { id: "42" });
    await r.navigate("users.view", { id: "43" });
    globalThis.history.back();
    await settle();
    r.navigateToNotFound("/missing");
    globalThis.history.back();
    await settle();
    r.navigateToNotFound("/missing");

    // The router already holds this not-found, so the traversal writes nothing.
    globalThis.history.forward();
    await settle();
    refuse(r, "enter", "users.view");

    globalThis.history.forward();
    await settle();

    expect(at()).toStrictEqual({ path: "/missing", route: UNKNOWN_ROUTE });

    r.stop();
    globalThis.history.forward();
    await settle();

    expect(globalThis.location.pathname).toBe("/users/view/43");
  });

  it("strict mode: a not-found entry the plugin wrote under allowNotFound stays ahead", async () => {
    const loose = await setup({ allowNotFound: true });

    await loose.navigate("users.list");
    loose.navigateToNotFound("/nope");
    globalThis.history.back();
    await settle();

    expect(at()).toStrictEqual({ path: "/home", route: "home" });

    loose.stop();

    const strict = createRouter(routerConfig, {
      defaultRoute: "home",
      allowNotFound: false,
    });

    strict.usePlugin(browserPluginFactory({}, createJsdomBrowser()));
    await strict.start();
    router = strict;

    globalThis.history.forward();
    await settle();

    expect(at()).toStrictEqual({ path: "/home", route: "home" });

    strict.stop();
    globalThis.history.forward();
    await settle();

    expect(globalThis.location.pathname).toBe("/nope");
  });

  describe("where the distance cannot be measured, the entry the browser stands on is rewritten", () => {
    it("a browser that cannot travel", async () => {
      const browser = createJsdomBrowser();

      delete browser.go;

      const r = await setup({ browser });

      await r.navigate("users.view", { id: "42" });
      refuse(r, "leave", "users.view");

      globalThis.history.back();
      await settle();

      expect(at()).toStrictEqual({
        path: "/users/view/42",
        route: "users.view",
      });

      // The browser stands on /home's entry, rewritten.
      r.stop();
      globalThis.history.back();
      await settle();

      expect(globalThis.location.pathname).toBe("/sentinel");
    });

    it("an entry other code wrote", async () => {
      const r = await setup({ before: ["/users/list"] });

      refuse(r, "leave", "home");

      globalThis.history.back();
      await settle();

      expect(at()).toStrictEqual({ path: "/home", route: "home" });

      // The browser stands on the rewritten entry, one step from the sentinel.
      r.stop();
      globalThis.history.back();
      await settle();

      expect(globalThis.location.pathname).toBe("/sentinel");
    });

    it("a traversal across an entry other code pushed: the plugin's entries on either side are numbered apart", async () => {
      const r = await setup();

      await r.navigate("users.list");
      globalThis.history.pushState({ other: true }, "", "/elsewhere");
      await r.navigate("users.view", { id: "42" });
      refuse(r, "leave", "users.view");
      started = [];

      globalThis.history.go(-2);
      await settle();

      expect(started).toStrictEqual(["users.list"]);
      expect(at()).toStrictEqual({
        path: "/users/view/42",
        route: "users.view",
      });

      // The browser stands on users.list's entry, rewritten.
      r.stop();
      globalThis.history.back();
      await settle();

      expect(globalThis.location.pathname).toBe("/home");
    });
  });

  it("a return that lands elsewhere is a traversal of its own, and the guard is asked again", async () => {
    // A first `go` that falls one entry short, as if entries had moved under
    // the plugin.
    const browser = createJsdomBrowser();
    let short = true;
    const r = await setup({
      browser: {
        ...browser,
        go: (delta) => {
          browser.go?.(short ? delta - Math.sign(delta) : delta);
          short = false;
        },
      },
    });

    await r.navigate("users.list");
    await r.navigate("users.view", { id: "42" });
    refuse(r, "leave", "users.view");
    started = [];

    globalThis.history.go(-2);
    await settle();

    expect(started).toStrictEqual(["home", "users.list"]);
    expect(at()).toStrictEqual({ path: "/users/view/42", route: "users.view" });

    // Every entry stays where it was.
    r.stop();
    globalThis.history.back();
    await settle();

    expect(globalThis.location.pathname).toBe("/users/list");
  });

  describe("controls", () => {
    it("a traversal onto an entry with the router's own state stays there: SAME_STATES refuses nothing", async () => {
      const r = await setup();

      await r.navigate("users.list");
      await r.navigate("home");

      globalThis.history.go(-2);
      await settle();

      expect(at()).toStrictEqual({ path: "/home", route: "home" });

      // The browser stands on the first /home entry: users.list is ahead.
      r.stop();
      globalThis.history.forward();
      await settle();

      expect(globalThis.location.pathname).toBe("/users/list");
    });

    it("an allowed Back moves the router", async () => {
      const r = await setup();

      await r.navigate("users.view", { id: "42" });

      globalThis.history.back();
      await settle();

      expect(at()).toStrictEqual({ path: "/home", route: "home" });
    });

    it("an allowed Back to a not-found entry under allowNotFound", async () => {
      await setup({ before: ["/nope"] });

      globalThis.history.back();
      await settle();

      expect(at()).toStrictEqual({ path: "/nope", route: UNKNOWN_ROUTE });
    });
  });
});
