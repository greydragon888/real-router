import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { createDirectionTracker } from "../../../src/dom-utils";

import type { Route, Router } from "@real-router/core";

/**
 * A popstate belongs to the traversal it starts. One that arrives while a
 * transition is in flight is replayed after it, so it is that replay's — the
 * leave of the transition in flight does not spend it, and a refusal that
 * names another address does not either. Each CONTROL lets the first Back land
 * before the second.
 */

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

const ROUTES: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "contact", path: "/contact" },
];

let router: Router | undefined;
let destroyTracker: (() => void) | undefined;

const direction = (): string | undefined =>
  document.documentElement.dataset.navDirection;

/** The tracker is installed before the URL plugin, as it documents. */
async function install(): Promise<Router> {
  globalThis.history.replaceState(null, "", "/");

  const created = createRouter(ROUTES, {
    defaultRoute: "home",
    logger: { level: "none" },
  });

  destroyTracker = createDirectionTracker(created).destroy;
  created.usePlugin(browserPluginFactory());
  await created.start();
  router = created;
  await created.navigate("about");
  await created.navigate("contact"); // entries: /, /about, /contact

  return created;
}

/** A guard that holds its first call until released, and allows the rest. */
function holdFirst(): {
  guard: () => () => boolean | Promise<boolean>;
  release: () => void;
} {
  let release: ((allowed: boolean) => void) | undefined;

  return {
    guard: () => () => {
      if (release !== undefined) {
        return true;
      }

      return new Promise<boolean>((resolve) => {
        release = resolve;
      });
    },
    release: () => {
      release?.(true);
    },
  };
}

/**
 * Two Backs from "contact"; the first is held before its leave. With
 * `sequential` it is released before the second. Returns where the router
 * lands and the label it lands with.
 */
async function backsHeldBeforeLeave(sequential: boolean): Promise<string> {
  const created = await install();
  const held = holdFirst();

  getLifecycleApi(created).addDeactivateGuard("contact", held.guard);

  globalThis.history.back(); // to /about, held before its leave
  await settle();

  if (sequential) {
    held.release();
    await settle();
  }

  globalThis.history.back(); // to /
  await settle();
  held.release();
  await settle();

  return `${created.getState()?.name}:${direction()}`;
}

/**
 * Two Backs from "contact"; the first is held after its leave, and the second
 * is replayed after it. With `refuse`, a refusal naming "contact" arrives
 * while the first is held. Returns the label of the first leave, then where
 * the router lands and the label it lands with.
 */
async function backBehindHeldOne(refuse: boolean): Promise<string[]> {
  const created = await install();
  const held = holdFirst();

  getLifecycleApi(created).addActivateGuard("about", held.guard);

  globalThis.history.back(); // to /about: leave done, held by canActivate
  await settle();

  const firstLabel = direction();

  globalThis.history.back(); // to /, replayed after the first
  await settle();

  if (refuse) {
    await created.navigate("contact").catch(noop); // SAME_STATES
  }

  held.release();
  await settle();

  return [String(firstLabel), `${created.getState()?.name}:${direction()}`];
}

describe("createDirectionTracker — overlapping traversals", () => {
  afterEach(() => {
    destroyTracker?.();
    destroyTracker = undefined;
    router?.stop();
    router = undefined;
    delete document.documentElement.dataset.navDirection;
  });

  it("a Back held before its leave and a second one behind it are both labelled back", async () => {
    await expect(backsHeldBeforeLeave(false)).resolves.toBe("home:back");
  });

  it("CONTROL — the first Back lands before the second", async () => {
    await expect(backsHeldBeforeLeave(true)).resolves.toBe("home:back");
  });

  it("a refusal that names another address leaves a Back behind a held one labelled back", async () => {
    await expect(backBehindHeldOne(true)).resolves.toStrictEqual([
      "back",
      "home:back",
    ]);
  });

  it("CONTROL — no refusal arrives while the first Back is held", async () => {
    await expect(backBehindHeldOne(false)).resolves.toStrictEqual([
      "back",
      "home:back",
    ]);
  });
});
