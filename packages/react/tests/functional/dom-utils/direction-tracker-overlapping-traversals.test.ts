import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter, errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { createDirectionTracker } from "../../../src/dom-utils";

import type { Options, Route, Router } from "@real-router/core";

/**
 * A popstate belongs to the traversal it starts. One that arrives while a
 * transition is in flight is replayed after it, so it is that replay's — the
 * leave of the transition in flight does not spend it, and a refusal that
 * names another address does not either. Each CONTROL lets the first Back land
 * before the second. A popstate the URL plugin drops when it returns from a
 * refused or quietly cancelled Back is replayed by nobody, so its flag ends
 * with the return.
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
  { name: "pricing", path: "/pricing" },
];

let router: Router | undefined;
let destroyTracker: (() => void) | undefined;

const direction = (): string | undefined =>
  document.documentElement.dataset.navDirection;

/** The tracker is installed before the URL plugin, as it documents. */
async function install(options: Partial<Options> = {}): Promise<Router> {
  globalThis.history.replaceState(null, "", "/");

  const created = createRouter(ROUTES, {
    defaultRoute: "home",
    logger: { level: "none" },
    ...options,
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
 * A guard that holds its first call until `end` gives the verdict, and allows
 * the rest.
 */
function holdFirstUntil(): {
  guard: () => () => boolean | Promise<boolean>;
  end: (verdict: "allows" | "refuses" | "cancels quietly") => void;
} {
  let decide: ((allowed: boolean) => void) | undefined;
  let cancel: ((error: unknown) => void) | undefined;

  return {
    guard: () => () => {
      if (decide !== undefined) {
        return true;
      }

      return new Promise<boolean>((resolve, reject) => {
        decide = resolve;
        cancel = reject;
      });
    },
    end: (verdict) => {
      if (verdict === "cancels quietly") {
        cancel?.(new RouterError(errorCodes.TRANSITION_CANCELLED));
      } else {
        decide?.(verdict === "allows");
      }
    },
  };
}

/**
 * Two Backs from "contact"; the first is held before its leave. With
 * `sequential` it is released before the second. Returns where the router
 * lands, then the label of each leave.
 */
async function backsHeldBeforeLeave(sequential: boolean): Promise<string[]> {
  const created = await install();
  const held = holdFirst();
  const labels: string[] = [];

  getLifecycleApi(created).addDeactivateGuard("contact", held.guard);
  // Registered after the tracker, so it reads what the tracker wrote.
  created.subscribeLeave(() => {
    labels.push(String(direction()));
  });

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

  return [String(created.getState()?.name), ...labels];
}

/** What the traversal behind the held one reaches, written before it runs. */
const REACHED = {
  "its own URL": async () => undefined,
  "a fragment": async (created: Router) => {
    await created.navigate("about", {}, undefined, { hash: "team" });
    await created.navigate("contact");
  },
  "a query no route declares": async (created: Router) => {
    await created.navigate("home");
    globalThis.history.pushState(null, "", "/about?utm=1");
    await created.navigate("contact");
  },
  "a trailing slash": async (created: Router) => {
    await created.navigate("about");
    globalThis.history.replaceState(null, "", "/about/");
    await created.navigate("contact");
  },
  "a query the browser encodes": async (created: Router) => {
    await created.navigate("about", {}, { q: "a'b" });
    await created.navigate("contact");
  },
} as const;

type Reached = keyof typeof REACHED;

const OPTIONS_OF: Partial<Record<Reached, Partial<Options>>> = {
  "a query the browser encodes": { rewritePathOnMatch: false },
};

const VERDICTS = [
  ["allows", ["about", "back", "back"]],
  ["refuses", ["about", "back"]],
] as const;

/**
 * From "pricing", a Back onto an entry the browser wrote, held before its
 * leave, and a traversal to "about" behind it. The plugin measures no distance
 * from that entry, so the end of the first writes the router's URL over the
 * entry the second reached. Returns where the router lands, then the label of
 * each leave.
 */
async function traversalsOverEntryNoPluginWrote(
  verdict: "allows" | "refuses",
  reached: Reached,
): Promise<string[]> {
  const created = await install(OPTIONS_OF[reached]);
  const held = holdFirstUntil();
  const labels: string[] = [];

  await REACHED[reached](created);
  globalThis.location.hash = "part";
  await settle();
  await created.navigate("pricing");

  getLifecycleApi(created).addDeactivateGuard("pricing", held.guard);
  created.subscribeLeave(() => {
    labels.push(String(direction()));
  });

  globalThis.history.back(); // to /contact#part, held before its leave
  await settle();
  globalThis.history.go(-2); // to /about
  await settle();
  held.end(verdict);
  await settle();

  return [String(created.getState()?.name), ...labels];
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
    await expect(backsHeldBeforeLeave(false)).resolves.toStrictEqual([
      "home",
      "back",
      "back",
    ]);
  });

  it.each(
    (Object.keys(REACHED) as Reached[]).flatMap((reached) =>
      VERDICTS.map(([verdict, labels]) => [reached, verdict, labels] as const),
    ),
  )(
    "a traversal behind a held one, over an entry no plugin wrote, onto %s is labelled back when the guard %s the first",
    async (reached, verdict, labels) => {
      await expect(
        traversalsOverEntryNoPluginWrote(verdict, reached),
      ).resolves.toStrictEqual(labels);
    },
  );

  it("CONTROL — the first Back lands before the second", async () => {
    await expect(backsHeldBeforeLeave(true)).resolves.toStrictEqual([
      "home",
      "back",
      "back",
    ]);
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

  it.each(["refuses", "cancels quietly"] as const)(
    "a Back behind one a guard %s is dropped with the plugin's return, and the next navigation is labelled forward",
    async (verdict) => {
      const created = await install();
      const held = holdFirstUntil();

      getLifecycleApi(created).addDeactivateGuard("contact", held.guard);

      globalThis.history.back(); // to /about, held before its leave
      await settle();
      globalThis.history.back(); // to /, waiting behind it
      await settle();
      held.end(verdict);
      await settle(); // the plugin returns to /contact and drops the second

      expect(created.getState()?.name).toBe("contact");

      await created.navigate("about");

      expect(direction()).toBe("forward");
    },
  );

  it("a Forward onto the router's entry while a Back is held before its leave keeps that Back's label", async () => {
    const created = await install();
    const held = holdFirst();
    const labels: (string | undefined)[] = [];

    getLifecycleApi(created).addDeactivateGuard("contact", held.guard);
    // Registered after the tracker, so it reads what the tracker wrote.
    created.subscribeLeave(() => {
      labels.push(direction());
    });

    globalThis.history.back(); // to /about, held before its leave
    await settle();
    globalThis.history.forward(); // onto /contact, the entry the router shows
    await settle();
    held.release();
    await settle();

    expect(labels[0]).toBe("back");
  });
});
