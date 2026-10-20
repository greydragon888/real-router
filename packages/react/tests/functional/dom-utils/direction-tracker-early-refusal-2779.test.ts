import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter, events } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { createDirectionTracker } from "../../../src/dom-utils";

import type { Route, Router, State } from "@real-router/core";

// jsdom fires a traversal's `popstate` on a later task, and the transition it
// starts settles on later ones.
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

const noop = (): void => {};

// Core reports a refusal that starts no transition on `TRANSITION_ERROR`, with
// no `TRANSITION_START` before it (#2779). "about" is the committed route.
const REFUSALS: Record<string, (router: Router) => Promise<unknown>> = {
  SAME_STATES: (router) => router.navigate("about").catch(noop),
  ROUTE_NOT_FOUND: (router) => router.navigate("nowhere").catch(noop),
};

const ROUTES: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "contact", path: "/contact" },
];

let router: Router | undefined;
let destroyTracker: (() => void) | undefined;

const direction = (): string | undefined =>
  document.documentElement.dataset.navDirection;

function teardown(): void {
  destroyTracker?.();
  destroyTracker = undefined;
  router?.stop();
  router = undefined;
  delete document.documentElement.dataset.navDirection;
}

/** The tracker is installed before the URL plugin, as it documents. */
async function install(routes: Route[], plugin = true): Promise<Router> {
  globalThis.history.replaceState(null, "", "/");

  const created = createRouter(routes, {
    defaultRoute: "home",
    logger: { level: "none" },
  });

  destroyTracker = createDirectionTracker(created).destroy;

  if (plugin) {
    created.usePlugin(browserPluginFactory());
    await created.start();
  } else {
    await created.start("/");
  }

  router = created;

  return created;
}

function countErrors(created: Router): () => number {
  let errors = 0;

  getPluginApi(created).addEventListener(events.TRANSITION_ERROR, () => {
    errors++;
  });

  return () => errors;
}

/**
 * A Back away from "about", held by its deactivation guard, which then allows
 * it — or refuses it, and a link to "contact" leaves instead. Returns the label
 * of whichever navigation left, and how many errors the refusal reported.
 */
async function heldBack(
  refuse: ((router: Router) => Promise<unknown>) | undefined,
  allow = true,
): Promise<{ label: string | undefined; refusalErrors: number }> {
  const created = await install(ROUTES);

  await created.navigate("about");

  let release: ((allowed: boolean) => void) | undefined;

  // Holds the first departure only.
  getLifecycleApi(created).addDeactivateGuard("about", () => () => {
    if (release !== undefined) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      release = resolve;
    });
  });

  const errors = countErrors(created);

  globalThis.history.back();
  await settle();

  // The Back reached the guard and waits there.
  expect(release).toBeTypeOf("function");

  await refuse?.(created);

  const refusalErrors = errors();

  release?.(allow);
  await settle();

  if (allow) {
    expect(created.getState()?.name).toBe("home");
  } else {
    expect(created.getState()?.name).toBe("about");

    await created.navigate("contact");
  }

  return { label: direction(), refusalErrors };
}

describe("createDirectionTracker — a refusal that starts no transition (#2779)", () => {
  afterEach(teardown);

  it.each(Object.keys(REFUSALS))(
    "a Back held by a guard is still labelled back after an unrelated %s refusal",
    async (refusal) => {
      const control = await heldBack(undefined);

      teardown();

      const outcome = await heldBack(REFUSALS[refusal]);

      expect(control).toStrictEqual({ label: "back", refusalErrors: 0 });
      expect(outcome).toStrictEqual({ label: "back", refusalErrors: 1 });
    },
  );

  it.each(Object.keys(REFUSALS))(
    "a Back its own guard refuses still spends the flag after an unrelated %s refusal",
    async (refusal) => {
      const outcome = await heldBack(REFUSALS[refusal], false);

      expect(outcome).toStrictEqual({ label: "forward", refusalErrors: 1 });
    },
  );

  it("a SAME_STATES refusal naming the route of the Back in flight leaves the flag to the Back", async () => {
    const created = await install([
      { name: "home", path: "/" },
      { name: "user", path: "/users/:id" },
    ]);

    await created.navigate("user", { id: "1" });
    await created.navigate("user", { id: "2" });

    let release: ((allowed: boolean) => void) | undefined;

    getLifecycleApi(created).addDeactivateGuard("user", () => () => {
      if (release !== undefined) {
        return true;
      }

      return new Promise<boolean>((resolve) => {
        release = resolve;
      });
    });

    const errors = countErrors(created);

    globalThis.history.back();
    await settle();

    expect(release).toBeTypeOf("function");

    // Refused against the committed `user` 2: a fresh state of the same name.
    await created.navigate("user", { id: "2" }).catch(noop);

    expect(errors()).toBe(1);

    release?.(true);
    await settle();

    expect(created.getState()?.params).toStrictEqual({ id: "1" });
    expect(direction()).toBe("back");
  });

  it("a SAME_STATES refusal equal to a held reload in all but its context leaves a Back that cancels the reload labelled back", async () => {
    const backDuringReload = async (
      refuse: boolean,
    ): Promise<{
      state: string | undefined;
      label: string | undefined;
      refusalErrors: number;
    }> => {
      const created = await install(ROUTES);

      await created.navigate("about");

      let release: (() => void) | undefined;

      // A reload of the active route runs no activation guard: hold its leave
      // instead, and only its.
      created.subscribeLeave(async () => {
        if (release === undefined) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
      });

      const errors = countErrors(created);
      const reload = created
        .navigate("about", {}, undefined, { reload: true })
        .catch(noop);

      await settle();

      expect(release).toBeTypeOf("function");

      if (refuse) {
        // Refused against the committed `about`: the same name, params and
        // path as the reload in flight.
        await created.navigate("about").catch(noop);
      }

      const refusalErrors = errors();

      // The plugin handles a popstate that arrives during a programmatic
      // transition on the spot, and its navigation cancels the reload.
      globalThis.history.back();
      await settle();
      release?.();
      await reload;

      const outcome = {
        state: created.getState()?.name,
        label: direction(),
        refusalErrors,
      };

      teardown();

      return outcome;
    };

    const control = await backDuringReload(false);
    const outcome = await backDuringReload(true);

    expect(control).toStrictEqual({
      state: "home",
      label: "back",
      refusalErrors: 0,
    });
    expect(outcome).toStrictEqual({
      state: "home",
      label: "back",
      refusalErrors: 1,
    });
  });

  it("a Back refused on the spot while a link's navigation is held does not label the next navigation back", async () => {
    const created = await install([
      { name: "home", path: "/" },
      { name: "legacy", path: "/legacy" },
      { name: "about", path: "/about" },
      { name: "contact", path: "/contact" },
    ]);

    await created.navigate("legacy");
    await created.navigate("home");
    // The entry behind the current one now names a route that is gone.
    getRoutesApi(created).remove("legacy");

    let release: ((allowed: boolean) => void) | undefined;

    getLifecycleApi(created).addActivateGuard(
      "about",
      () => () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );

    const errors = countErrors(created);
    const navigation = created.navigate("about").catch(noop);

    await settle();

    // The link's navigation left "home" and waits in its activation guard.
    expect(direction()).toBe("forward");
    expect(release).toBeTypeOf("function");

    // The plugin handles this popstate on the spot: the route is gone, so core
    // refuses it with ROUTE_NOT_FOUND and the plugin returns the browser.
    globalThis.history.back();
    await settle();

    expect(errors()).toBe(1);

    release?.(true);
    await navigation;
    await created.navigate("contact");

    expect(direction()).toBe("forward");
  });

  // A failure the commit itself raises carries the committed copy of the
  // state, not the object the start did. A signal whose `aborted` getter throws
  // on read `n` fails the link's navigation at each point the signal is read;
  // #2740's arc then follows — a Back the page's guard refuses, then a link.
  it("a link whose commit fails leaves nothing in flight for a refused Back", async () => {
    // Where each run whose failure carried the copy ended, and its label.
    const outcomes: { state: string | undefined; label: string | undefined }[] =
      [];

    for (let n = 1; n <= 8; n++) {
      const created = await install(ROUTES);

      await created.navigate("about");

      const api = getPluginApi(created);
      let started: State | undefined;
      const copies: boolean[] = [];
      const offStart = api.addEventListener(
        events.TRANSITION_START,
        (toState: State) => {
          started = toState;
        },
      );
      const offError = api.addEventListener(
        events.TRANSITION_ERROR,
        (toState: State | undefined) => {
          copies.push(toState !== undefined && toState !== started);
        },
      );
      const controller = new AbortController();
      let reads = 0;

      Object.defineProperty(controller.signal, "aborted", {
        get() {
          reads++;

          if (reads === n) {
            throw new Error(`read ${n}`);
          }

          return false;
        },
      });

      await created
        .navigate("contact", {}, undefined, { signal: controller.signal })
        .catch(noop);
      offStart();
      offError();

      if (copies.includes(true)) {
        const state = created.getState()?.name;
        let refusing = true;

        getLifecycleApi(created).addDeactivateGuard(
          "about",
          () => () => !refusing,
        );

        globalThis.history.back();
        await settle();

        refusing = false;
        await created.navigate("contact");

        outcomes.push({ state, label: direction() });
      }

      teardown();
    }

    // The sweep reached the commit: some failure carried the copy.
    expect(outcomes).not.toHaveLength(0);
    expect(outcomes).toStrictEqual(
      outcomes.map(() => ({ state: "about", label: "forward" })),
    );
  });

  // Without a URL plugin a popstate that arrives during a transition is kept
  // for a replay that never comes. An error with nothing in flight spends it.
  it("an idle refusal spends a flag a finished transition kept", async () => {
    const labelAfter = async (refuse: boolean): Promise<string | undefined> => {
      const created = await install(ROUTES, false);

      let release: ((allowed: boolean) => void) | undefined;

      getLifecycleApi(created).addActivateGuard(
        "about",
        () => () =>
          new Promise<boolean>((resolve) => {
            release = resolve;
          }),
      );

      const navigation = created.navigate("about").catch(noop);

      await Promise.resolve();
      globalThis.dispatchEvent(new PopStateEvent("popstate"));
      release?.(true);
      await navigation;

      expect(created.getState()?.name).toBe("about");

      if (refuse) {
        await created.navigate("about").catch(noop);
      }

      await created.navigate("contact");

      const label = direction();

      teardown();

      return label;
    };

    await expect(labelAfter(false)).resolves.toBe("back");
    await expect(labelAfter(true)).resolves.toBe("forward");
  });
});
