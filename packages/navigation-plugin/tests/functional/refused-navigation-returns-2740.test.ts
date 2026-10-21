import { createRouter, events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { describe, afterEach, it, expect } from "vitest";

import { navigationPluginFactory } from "../../src";
import { MockNavigation } from "../helpers/mockNavigation";
import {
  createMockNavigationBrowser,
  routerConfig,
} from "../helpers/testUtils";

import type { Router } from "@real-router/core";

// Lets the handler, the router transition and the plugin's own traversal run.
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

let router: Router | undefined;

async function setup(
  options: {
    allowNotFound?: boolean;
    url?: string;
    mock?: MockNavigation;
  } = {},
): Promise<{
  mock: MockNavigation;
  router: Router;
  started: string[];
  errors: string[];
}> {
  const mock =
    options.mock ?? new MockNavigation(options.url ?? "http://localhost/home");
  const started: string[] = [];
  const errors: string[] = [];

  router = createRouter(routerConfig, {
    defaultRoute: "home",
    allowNotFound: options.allowNotFound ?? true,
  });
  router.usePlugin(
    navigationPluginFactory({}, createMockNavigationBrowser(mock)),
    () => ({
      onTransitionStart: (toState) => {
        started.push(toState.name);
      },
      onTransitionError: (_toState, _fromState, error) => {
        errors.push(error.code);
      },
    }),
  );
  await router.start();

  return { mock, router, started, errors };
}

const history = (mock: MockNavigation) => ({
  entries: mock.entries().map((entry) => {
    const url = new URL(entry.url);

    return url.pathname + url.hash;
  }),
  index: mock.currentEntry?.index,
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

describe("a browser navigation the router refuses returns to the entry it started from (#2740)", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  describe("traversals keep every entry where it was", () => {
    it("Back refused by canDeactivate, and the page left behind is still one Back away", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });
      const guard = refuse(r, "leave", "users.view");

      mock.back();
      await settle();

      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/users/view/42"],
        index: 1,
      });
      expect(r.getState()?.name).toBe("users.view");

      guard.allow();
      mock.back();
      await settle();

      expect(history(mock).index).toBe(0);
      expect(r.getState()?.name).toBe("home");
    });

    it("Back refused by canActivate", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });
      refuse(r, "enter", "home");

      mock.back();
      await settle();

      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/users/view/42"],
        index: 1,
      });
      expect(r.getState()?.name).toBe("users.view");
    });

    it("Forward refused, and the page ahead is still one Forward away", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });
      mock.back();
      await settle();
      const guard = refuse(r, "leave", "home");

      mock.forward();
      await settle();

      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/users/view/42"],
        index: 0,
      });
      expect(r.getState()?.name).toBe("home");

      guard.allow();
      mock.forward();
      await settle();

      expect(history(mock).index).toBe(1);
      expect(r.getState()?.name).toBe("users.view");
    });

    it("a two-step traversal refused", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.list");
      await r.navigate("users.view", { id: "42" });
      refuse(r, "leave", "users.view");

      mock.traverseTo(mock.entries()[0].key);
      await settle();

      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/users/list", "/users/view/42"],
        index: 2,
      });
      expect(r.getState()?.name).toBe("users.view");
    });

    it("keeps the fragment of the entry it returns to", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" }, undefined, { hash: "sec" });
      refuse(r, "leave", "users.view");

      mock.back();
      await settle();

      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/users/view/42#sec"],
        index: 1,
      });
    });

    it("the return reaches no router transition and reports nothing", async () => {
      const { mock, router: r, started, errors } = await setup();

      await r.navigate("users.view", { id: "42" });
      refuse(r, "leave", "users.view");
      started.length = 0;

      mock.back();
      await settle();

      expect(started).toStrictEqual(["home"]);
      expect(errors).toStrictEqual(["CANNOT_DEACTIVATE"]);
      expect(history(mock).index).toBe(1);
    });

    // A navigation that finishes has the browser apply its scroll to the
    // page the router stayed on.
    it("the refused navigation rejects with the refusal", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });
      refuse(r, "leave", "users.view");

      await expect(mock.back().finished).rejects.toMatchObject({
        code: "CANNOT_DEACTIVATE",
      });
    });
  });

  describe("a refused push returns to the entry it was pushed from", () => {
    it("a link to a URL with a route", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });
      refuse(r, "leave", "users.view");

      mock.navigate("http://localhost/users/list");
      await settle();

      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/users/view/42", "/users/list"],
        index: 1,
      });
      expect(r.getState()?.name).toBe("users.view");
      // The history extensions see the refused entry ahead.
      expect(r.canGoForward()).toBe(true);
      expect(r.peekForward()?.name).toBe("users.list");
      expect(r.getRouteVisitCount("users.list")).toBe(1);
    });

    it("a history.pushState() to a URL with a route", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });
      refuse(r, "leave", "users.view");

      mock.historyPushState("/users/list");
      await settle();

      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/users/view/42", "/users/list"],
        index: 1,
      });
      expect(r.getState()?.name).toBe("users.view");
    });
  });

  describe("the not-found arm returns as well, and still rejects", () => {
    // Under allowNotFound the arm refuses only when the current route's
    // canDeactivate does; strict mode refuses every unmatched URL.
    const arms = [
      {
        allowNotFound: true,
        code: "CANNOT_DEACTIVATE",
        arrange: (r: Router, current: string) => {
          refuse(r, "leave", current);
        },
      },
      {
        allowNotFound: false,
        code: "ROUTE_NOT_FOUND",
        arrange: () => undefined,
      },
    ];

    it.each(arms)(
      "a history.pushState() to a URL with no route — allowNotFound: $allowNotFound",
      async ({ allowNotFound, code, arrange }) => {
        const { mock, router: r } = await setup({ allowNotFound });

        await r.navigate("users.view", { id: "42" });
        arrange(r, "users.view");

        const { finished } = mock.historyPushState("/nope");

        await expect(finished).rejects.toMatchObject({ code });

        await settle();

        expect(history(mock)).toStrictEqual({
          entries: ["/home", "/users/view/42", "/nope"],
          index: 1,
        });
        expect(r.getState()?.name).toBe("users.view");
      },
    );

    it.each(arms)(
      "Back to an entry with no route — allowNotFound: $allowNotFound",
      async ({ allowNotFound, code, arrange }) => {
        // An entry the router never wrote: pushed before it started.
        const mock = new MockNavigation("http://localhost/nope");

        mock.historyPushState("http://localhost/home");

        const { router: r } = await setup({ allowNotFound, mock });

        arrange(r, "home");

        const { finished } = mock.back();

        await expect(finished).rejects.toMatchObject({ code });

        await settle();

        expect(history(mock)).toStrictEqual({
          entries: ["/nope", "/home"],
          index: 1,
        });
        expect(r.getState()?.name).toBe("home");
      },
    );
  });

  it("a download that aborts a navigation the router is still taking returns to that navigation's origin", async () => {
    const { mock, router: r } = await setup();

    getLifecycleApi(r).addActivateGuard(
      "users.view",
      () => () => new Promise<boolean>(() => {}),
    );
    mock.navigate("http://localhost/users/view/42");
    await settle();
    mock.download("http://localhost/files/report.txt");
    await settle();

    expect(history(mock)).toStrictEqual({
      entries: ["/home", "/users/view/42"],
      index: 0,
    });
    expect(r.getState()?.name).toBe("home");
    expect(mock.downloads).toStrictEqual(["http://localhost/files/report.txt"]);
  });

  it("with no current entry to start from, the recovery rewrites the entry the browser stands on", async () => {
    const mock = new MockNavigation("http://localhost/home");
    const browser = { ...createMockNavigationBrowser(mock) };

    Object.defineProperty(browser, "currentEntry", { get: () => null });

    router = createRouter(routerConfig, { defaultRoute: "home" });
    router.usePlugin(navigationPluginFactory({}, browser));
    await router.start();
    await router.navigate("users.view", { id: "42" });
    refuse(router, "leave", "users.view");

    mock.back();
    await settle();

    expect(history(mock).entries).toStrictEqual([
      "/users/view/42",
      "/users/view/42",
    ]);
    expect(router.getState()?.name).toBe("users.view");
  });

  describe("a navigation that follows one the router took to the end", () => {
    it("a refused Back after an allowed one returns to the entry the allowed one reached", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.list");
      await r.navigate("users.view", { id: "42" });
      mock.back();
      await settle();
      refuse(r, "leave", "users.list");

      mock.back();
      await settle();

      expect(r.getState()?.name).toBe("users.list");
      expect(history(mock).index).toBe(1);
    });

    it("a refused navigation after a not-found one returns to the not-found entry", async () => {
      const { mock, router: r } = await setup({ allowNotFound: true });

      mock.historyPushState("/nope");
      await settle();
      refuse(r, "enter", "users.list");

      mock.navigate("http://localhost/users/list");
      await settle();

      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/nope", "/users/list"],
        index: 1,
      });
    });
  });

  describe("a navigation after one that did not move the router", () => {
    it("after a traversal onto the router's own state, a refused one returns to where that traversal landed", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.list");
      await r.navigate("home");
      mock.traverseTo(mock.entries()[0].key);
      await settle();
      refuse(r, "enter", "users.list");

      mock.forward();
      await settle();

      expect(r.getState()?.name).toBe("home");
      expect(history(mock).index).toBe(0);
    });

    it("after one a newer navigation cancelled, a refused one returns to the entry the router stands on", async () => {
      const { mock, router: r } = await setup();
      let refuseTheNewer: ((allowed: boolean) => void) | undefined;
      let views = 0;

      getLifecycleApi(r).addActivateGuard(
        "users.list",
        () => () => new Promise<boolean>(() => {}),
      );
      // The router navigation is held, and refused only once the one it
      // cancelled has settled — by then it owned the URL, and the cancelled
      // one left its entry where the browser committed it. Every later
      // navigation to users.view is refused at once.
      getLifecycleApi(r).addActivateGuard("users.view", () => () => {
        views++;

        return (
          views === 1 &&
          new Promise<boolean>((resolve) => {
            refuseTheNewer = resolve;
          })
        );
      });
      mock.navigate("http://localhost/users/list");
      await settle();

      const newer = r
        .navigate("users.view", { id: "1" })
        .catch(() => undefined);

      await settle();
      refuseTheNewer?.(false);
      await newer;
      await settle();

      mock.navigate("http://localhost/users/view/2");
      await settle();

      expect(r.getState()?.name).toBe("home");
      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/users/list", "/users/view/2"],
        index: 0,
      });
    });

    it("after the router restarted, a refused one returns to the entry it restarted on", async () => {
      const { mock, router: r } = await setup();
      const lifecycle = getLifecycleApi(r);

      lifecycle.addActivateGuard(
        "users.list",
        () => () => new Promise<boolean>(() => {}),
      );
      mock.navigate("http://localhost/users/list");
      await settle();
      r.stop();
      lifecycle.removeActivateGuard("users.list");
      await r.start("/users/list");
      refuse(r, "enter", "users.view");

      mock.navigate("http://localhost/users/view/42");
      await settle();

      expect(r.getState()?.name).toBe("users.list");
      expect(history(mock).index).toBe(1);
    });
  });

  describe("a navigation that arrives while the router is still taking another", () => {
    it("a second Back while canDeactivate decides returns, when refused, to the entry the router stands on", async () => {
      const { mock, router: r } = await setup();
      let answer: ((allowed: boolean) => void) | undefined;

      await r.navigate("users.list");
      await r.navigate("users.view", { id: "42" });
      getLifecycleApi(r).addDeactivateGuard(
        "users.view",
        () => () =>
          new Promise<boolean>((resolve) => {
            answer = resolve;
          }),
      );

      mock.back();
      await settle();
      mock.back();
      await settle();
      answer?.(false);
      await settle();

      expect(r.getState()?.name).toBe("users.view");
      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/users/list", "/users/view/42"],
        index: 2,
      });
    });

    it("when the entry the router stands on is gone, the entry the browser stands on is rewritten", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });
      getLifecycleApi(r).addActivateGuard(
        "home",
        () => () => new Promise<boolean>(() => {}),
      );
      refuse(r, "enter", "users.list");

      mock.back();
      await settle();
      // A push from #/home drops the entry of users.view, ahead of it.
      mock.navigate("http://localhost/users/list");
      await settle();

      expect(r.getState()?.name).toBe("users.view");
      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/users/view/42"],
        index: 1,
      });
    });

    it("a link refused while an earlier one waits on its guard returns to the entry the router stands on", async () => {
      const { mock, router: r } = await setup();

      getLifecycleApi(r).addActivateGuard(
        "users.list",
        () => () => new Promise<boolean>(() => {}),
      );
      refuse(r, "enter", "users.view");

      mock.navigate("http://localhost/users/list");
      await settle();
      mock.navigate("http://localhost/users/view/42");
      await settle();

      expect(r.getState()?.name).toBe("home");
      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/users/list", "/users/view/42"],
        index: 0,
      });
    });
  });

  it("a redirect a TRANSITION_ERROR listener defers is not undone by the return", async () => {
    const { mock, router: r } = await setup();

    refuse(r, "enter", "users.view");
    getPluginApi(r).addEventListener(events.TRANSITION_ERROR, () => {
      queueMicrotask(() => {
        void r.navigate("users.list").catch(() => undefined);
      });
    });

    await mock
      .navigate("http://localhost/users/view/42")
      .finished.catch(() => undefined);
    await settle();

    const { entries, index } = history(mock);

    expect(r.getState()?.name).toBe("users.list");
    expect(entries[index ?? -1]).toBe("/users/list");
  });

  describe("controls", () => {
    it("a replace refused rewrites the entry it replaced, which is the origin's slot", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });
      refuse(r, "leave", "users.view");

      mock.navigate("http://localhost/users/list", { history: "replace" });
      await settle();

      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/users/view/42"],
        index: 1,
      });
      expect(r.getState()?.name).toBe("users.view");
    });

    it("a traversal onto an entry with the router's own state stays there: SAME_STATES refuses nothing", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.list");
      await r.navigate("home");

      mock.traverseTo(mock.entries()[0].key);
      await settle();

      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/users/list", "/home"],
        index: 0,
      });
      expect(r.getState()?.name).toBe("home");
    });

    it("an allowed Back moves the router and leaves the entries alone", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });

      mock.back();
      await settle();

      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/users/view/42"],
        index: 0,
      });
      expect(r.getState()?.name).toBe("home");
    });

    it("a router-driven navigation refused writes no history at all", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });
      refuse(r, "leave", "users.view");

      await r.navigate("users.list").catch(() => undefined);
      await settle();

      expect(history(mock)).toStrictEqual({
        entries: ["/home", "/users/view/42"],
        index: 1,
      });
    });
  });
});
