import { UNKNOWN_ROUTE, createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, expect, it, vi } from "vitest";

import { navigationPluginFactory } from "../../src";
import { MockNavigation } from "../helpers/mockNavigation";
import { createMockNavigationBrowser, noop } from "../helpers/testUtils";

import type { NavigationBrowser, NavigationMeta } from "../../src/types";
import type { Router, State } from "@real-router/core";
import type { LoggerConfig } from "@real-router/core/types";

/**
 * A navigation's record — its metadata and, for `traverseToLast`, the entry to
 * traverse to — belongs to the transition its call starts, or to the commit it
 * makes without one.
 *
 * - A navigation that supersedes a router transition an async guard holds ends
 *   as it ends alone: it keeps its own record (#2753), and its success
 *   publishes no record the superseded one staged (#2754).
 * - A refusal that starts no transition — `SAME_STATES`, `ROUTE_NOT_FOUND` —
 *   leaves the record of the transition in flight alone.
 * - No navigation takes a record staged for another: not one a guard starts
 *   inside the staging call, not a commit after a failed transition or after
 *   one an earlier listener ended before the plugin heard it start, not a
 *   transition of a router a guard of that call restarted, not one whose call
 *   is nested in another's. The boundary: a commit an app makes during the
 *   plugin's not-found call takes that call's record.
 * - Core refuses a navigation an app starts from inside a router notification
 *   — a listener, an abort handler of the navigation a call supersedes — and
 *   a restart from there (#2778). The cells that try one pin the refusal and
 *   that each call keeps its record.
 * - The activation's record goes to the router's first transition or commit,
 *   on a router whose `getState()` and `getPreviousState()` are `undefined`.
 *
 * History is `/home`, `/about`, `/home`, `/users/list` (current) in every cell
 * that `createEnv` seeds.
 */

const ORIGIN = "http://localhost";

/** What the destination's guard reads: the published metadata, none, or no guard. */
type GuardSees = "meta" | "nothing" | "no guard";

interface Env {
  readonly router: Router;
  readonly mock: MockNavigation;
  /** Holds the next activation of `name` until `release()`. */
  readonly hold: (name: string) => void;
  readonly release: () => void;
  /** The next activation of `name` is refused. */
  readonly deny: (name: string) => void;
  /** The next activation of `name` runs `navigate` within the guard call. */
  readonly redirect: (name: string, navigate: () => void) => void;
  /** The next `browser.traverseTo()` throws, as for an evicted entry. */
  readonly breakNextTraverse: () => void;
  /**
   * Delivers a same-document replace to the plugin's listener whose handler
   * runs within the call, as a browser runs one without a precommit redirect.
   */
  readonly navigateInCall: (url: string) => void;
  /** What each route's `canActivate` read from `toState.context.navigation`. */
  readonly reads: Map<string, unknown>;
  /** The paths `browser.traverseTo()` was asked to reach. */
  readonly traversals: string[];
}

interface Outcome {
  readonly router: string | undefined;
  readonly browser: string;
  /** The index of the browser's current entry. */
  readonly entry: number | undefined;
  readonly meta: NavigationMeta | undefined;
  /** What the destination's guard read; `undefined` when it never ran. */
  readonly read: unknown;
  readonly traversals: readonly string[];
}

interface Navigation {
  readonly name: string;
  /** The route the navigation lands on. */
  readonly destination: string;
  readonly guardSees: GuardSees;
  /** The paths it asks `browser.traverseTo()` to reach, alone. */
  readonly traverses: readonly string[];
  readonly run: (env: Env) => Promise<unknown>;
}

const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

function pathOf(url: string): string {
  return new URL(url).pathname;
}

function sameDocumentReplace(url: string): NavigateEvent {
  return {
    canIntercept: true,
    info: undefined,
    downloadRequest: null,
    formData: null,
    navigationType: "replace",
    hashChange: false,
    userInitiated: false,
    sourceElement: null,
    signal: new AbortController().signal,
    destination: {
      url,
      sameDocument: true,
      index: -1,
      key: "",
      id: "",
      getState: () => undefined,
    },
    intercept: (options: NavigationInterceptOptions) => {
      Promise.resolve(options.handler?.()).catch(noop);
    },
    scroll: noop,
  } as unknown as NavigateEvent;
}

function createUnstartedEnv(
  url: string,
  options: {
    readonly allowNotFound: boolean;
    readonly activation?: NavigationType;
    /** Registers what must run before the navigation plugin's hooks. */
    readonly before?: (router: Router) => void;
    readonly logger?: Partial<LoggerConfig>;
  },
): Env {
  const mock = new MockNavigation(url);

  if (options.activation) {
    mock.activation = {
      entry: mock.currentEntry!,
      from: null,
      navigationType: options.activation,
    };
  }

  const base = createMockNavigationBrowser(mock);
  const traversals: string[] = [];
  let listener: ((event: NavigateEvent) => void) | undefined;
  let breakTraverse = false;
  const browser: NavigationBrowser = {
    ...base,
    get currentEntry() {
      return base.currentEntry;
    },
    addNavigateListener: (fn) => {
      listener = fn;

      return base.addNavigateListener(fn);
    },
    traverseTo: (key) => {
      const entry = mock.entries().find((candidate) => candidate.key === key);

      traversals.push(entry ? pathOf(entry.url) : key);

      if (breakTraverse) {
        breakTraverse = false;

        throw new DOMException("Evicted", "InvalidStateError");
      }

      base.traverseTo(key);
    },
  };
  const reads = new Map<string, unknown>();
  const once = new Map<string, () => boolean>();
  let held: string | undefined;
  let release: () => void = noop;
  const gate = new Promise<boolean>((resolve) => {
    release = () => {
      resolve(true);
    };
  });
  const canActivate = () => (toState: State) => {
    reads.set(toState.name, toState.context.navigation ?? "none");

    const action = once.get(toState.name);

    if (action) {
      once.delete(toState.name);

      return action();
    }

    if (toState.name !== held) {
      return true;
    }

    held = undefined;

    return gate;
  };
  const router = createRouter(
    [
      { name: "home", path: "/home", canActivate },
      { name: "about", path: "/about", canActivate },
      { name: "slow", path: "/slow", canActivate },
      { name: "other", path: "/other", canActivate },
      { name: "item", path: "/item/:id", canActivate },
      {
        name: "users",
        path: "/users",
        children: [{ name: "list", path: "/list", canActivate }],
      },
    ],
    {
      defaultRoute: "home",
      allowNotFound: options.allowNotFound,
      ...(options.logger && { logger: options.logger }),
    },
  );

  options.before?.(router);
  router.usePlugin(navigationPluginFactory({}, browser));

  return {
    router,
    mock,
    hold: (name) => {
      held = name;
    },
    release: () => {
      release();
    },
    deny: (name) => {
      once.set(name, () => false);
    },
    redirect: (name, navigate) => {
      once.set(name, () => {
        navigate();

        return true;
      });
    },
    breakNextTraverse: () => {
      breakTraverse = true;
    },
    navigateInCall: (destination) => {
      listener?.(sameDocumentReplace(destination));
    },
    reads,
    traversals,
  };
}

async function createEnv(): Promise<Env> {
  const env = createUnstartedEnv(`${ORIGIN}/home`, { allowNotFound: true });

  await env.router.start("/home");
  await env.router.navigate("about");
  await env.router.navigate("home");
  await env.router.navigate("users.list");
  env.reads.clear();
  env.traversals.length = 0;

  return env;
}

function outcome(env: Env, destination: string): Outcome {
  const state = env.router.getState();

  return {
    router: state?.path,
    browser: pathOf(env.mock.currentUrl),
    entry: env.mock.currentEntry?.index,
    meta: state?.context.navigation,
    read: env.reads.get(destination),
    traversals: [...env.traversals],
  };
}

/** The read a guard of `navigation` makes, given what `result` published. */
function expectedRead(navigation: Navigation, result: Outcome): unknown {
  return {
    meta: result.meta,
    nothing: "none",
    "no guard": undefined,
  }[navigation.guardSees];
}

/** The navigation's own promise, settled to its outcome code. */
function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  return promise.then(
    () => "resolved",
    (error: unknown) => (error as { code?: string }).code,
  );
}

/**
 * `stop()` and `start(path)` from inside a router notification: core refuses the
 * start synchronously (#2778), so the router stays stopped. The refusal's code,
 * or `"accepted"`.
 */
function restartInside(router: Router, path: string): string | undefined {
  router.stop();

  // eslint-disable-next-line sonarjs/no-try-promise -- the try captures the SYNC reentrancy throw; the rejection half is handled by .catch()
  try {
    router.start(path).catch(noop);
  } catch (error) {
    return (error as { code?: string }).code;
  }

  return "accepted";
}

/** A browser navigation's `finished`, which rejects when another aborts it. */
function finished(result: NavigationResult): Promise<unknown> {
  result.committed?.catch(noop);

  return result.finished?.catch(noop) ?? Promise.resolve();
}

/** A navigation that supersedes another, with what it lands on alone. */
type Superseding = Navigation & {
  readonly path: string;
  readonly navigationType: NavigationMeta["navigationType"];
};

const PUSH_UNMATCHED: Superseding = {
  name: "history.pushState() to a URL no route matches",
  destination: UNKNOWN_ROUTE,
  guardSees: "no guard",
  traverses: [],
  path: "/nope",
  navigationType: "push",
  run: (env) => finished(env.mock.historyPushState(`${ORIGIN}/nope`)),
};

const ROUTER_NAVIGATE: Superseding = {
  name: "router.navigate()",
  destination: "other",
  guardSees: "nothing",
  traverses: [],
  path: "/other",
  navigationType: "push",
  run: (env) => codeOf(env.router.navigate("other")),
};

const SUPERSEDING: readonly Superseding[] = [
  {
    name: "Back",
    destination: "home",
    guardSees: "meta",
    traverses: [],
    path: "/home",
    navigationType: "traverse",
    run: (env) => finished(env.mock.back()),
  },
  {
    name: "navigation.navigate() with info",
    destination: "other",
    guardSees: "meta",
    traverses: [],
    path: "/other",
    navigationType: "push",
    run: (env) =>
      finished(env.mock.navigate(`${ORIGIN}/other`, { info: "app" })),
  },
  {
    name: "navigation.navigate() with history: replace",
    destination: "other",
    guardSees: "meta",
    traverses: [],
    path: "/other",
    navigationType: "replace",
    run: (env) =>
      finished(env.mock.navigate(`${ORIGIN}/other`, { history: "replace" })),
  },
  {
    name: "history.pushState()",
    destination: "other",
    guardSees: "meta",
    traverses: [],
    path: "/other",
    navigationType: "push",
    run: (env) => finished(env.mock.historyPushState(`${ORIGIN}/other`)),
  },
  PUSH_UNMATCHED,
  ROUTER_NAVIGATE,
  {
    name: "traverseToLast()",
    destination: "home",
    guardSees: "meta",
    traverses: ["/home"],
    path: "/home",
    navigationType: "traverse",
    run: (env) => codeOf(env.router.traverseToLast("home")),
  },
];

/** Transitions an async guard on `held` keeps in flight. */
const IN_FLIGHT: readonly (Navigation & { readonly held: string })[] = [
  {
    name: "router.navigate()",
    destination: "slow",
    guardSees: "nothing",
    traverses: [],
    held: "slow",
    run: (env) => env.router.navigate("slow"),
  },
  {
    name: "traverseToLast()",
    destination: "about",
    guardSees: "meta",
    traverses: ["/about"],
    held: "about",
    run: (env) => env.router.traverseToLast("about"),
  },
  {
    name: "a push the browser started",
    destination: "slow",
    guardSees: "meta",
    traverses: [],
    held: "slow",
    run: (env) => finished(env.mock.navigate(`${ORIGIN}/slow`)),
  },
  {
    name: "Back",
    destination: "home",
    guardSees: "meta",
    traverses: [],
    held: "home",
    run: (env) => finished(env.mock.back()),
  },
];

/** The router's own transitions, which leave the browser where it is. */
const HELD_BY_THE_ROUTER = IN_FLIGHT.slice(0, 2);

/** Router calls refused before a transition starts. */
const REFUSALS: readonly {
  readonly code: string;
  readonly run: (env: Env) => Promise<unknown>;
}[] = [
  // The router already shows `users.list`: the transition in flight has not
  // committed.
  {
    code: errorCodes.SAME_STATES,
    run: (env) => env.router.navigate("users.list"),
  },
  {
    code: errorCodes.ROUTE_NOT_FOUND,
    run: (env) => env.router.navigate("nope"),
  },
];

async function alone(navigation: Navigation): Promise<Outcome> {
  const env = await createEnv();

  await navigation.run(env);
  await settle();

  const result = outcome(env, navigation.destination);

  env.router.stop();

  return result;
}

async function heldThenReleased(
  navigation: Navigation & { readonly held: string },
): Promise<Outcome> {
  const env = await createEnv();

  env.hold(navigation.held);

  const done = codeOf(navigation.run(env));

  await settle();
  env.release();
  await done;
  await settle();

  const result = outcome(env, navigation.destination);

  env.router.stop();

  return result;
}

describe("a navigation that supersedes a router transition ends as it ends alone (#2753, #2754)", () => {
  it.each(SUPERSEDING)(
    "alone, $name lands on $path and publishes $navigationType",
    async (navigation) => {
      const control = await alone(navigation);

      expect(control.router).toBe(navigation.path);
      expect(control.browser).toBe(navigation.path);
      expect(control.meta?.navigationType).toBe(navigation.navigationType);
      expect(control.read).toBe(expectedRead(navigation, control));
      expect(control.traversals).toStrictEqual(navigation.traverses);
    },
  );

  describe.each(HELD_BY_THE_ROUTER)("$name held by a guard", (superseded) => {
    it.each(SUPERSEDING)("superseded by $name", async (superseding) => {
      const control = await alone(superseding);
      const env = await createEnv();

      env.hold(superseded.held);

      const cancelled = codeOf(superseded.run(env));

      await settle();
      await superseding.run(env);
      await settle();
      env.release();
      await settle();

      await expect(cancelled).resolves.toBe(errorCodes.TRANSITION_CANCELLED);
      expect(outcome(env, superseding.destination)).toStrictEqual(control);

      env.router.stop();
    });
  });

  it("one that supersedes a traverseToLast() onto an entry with a fragment publishes its own", async () => {
    const env = createUnstartedEnv(`${ORIGIN}/home`, { allowNotFound: true });

    await env.router.start("/home");
    await env.router.navigate("about", {}, undefined, { hash: "team" });
    await env.router.navigate("home", {}, undefined, { hash: "" });
    await env.router.navigate("users.list", {}, undefined, { hash: "" });
    env.hold("about");

    const cancelled = codeOf(env.router.traverseToLast("about"));

    await settle();
    await codeOf(env.router.navigate("other"));
    await settle();
    env.release();
    await settle();

    await expect(cancelled).resolves.toBe(errorCodes.TRANSITION_CANCELLED);
    expect(env.router.getState()?.context.url).toStrictEqual({
      hash: "",
      hashChanged: false,
    });
    expect(env.mock.currentUrl).toBe(`${ORIGIN}/other`);

    env.router.stop();
  });
});

describe("a refusal that starts no transition leaves the one in flight its record", () => {
  it.each(IN_FLIGHT)(
    "alone, $name lands on its destination with its metadata",
    async (navigation) => {
      const control = await heldThenReleased(navigation);

      expect(control.router).toBe(`/${navigation.destination}`);
      expect(control.browser).toBe(control.router);
      expect(control.meta).toBeDefined();
      expect(control.read).toBe(expectedRead(navigation, control));
      expect(control.traversals).toStrictEqual(navigation.traverses);
    },
  );

  describe.each(IN_FLIGHT)("$name in flight", (inFlight) => {
    it.each(REFUSALS)("a $code refusal", async (refusal) => {
      const control = await heldThenReleased(inFlight);
      const env = await createEnv();

      env.hold(inFlight.held);

      // Core logs a hook that throws rather than failing the navigation.
      const errors = vi.spyOn(console, "error").mockImplementation(noop);
      const done = codeOf(inFlight.run(env));

      await settle();

      await expect(codeOf(refusal.run(env))).resolves.toBe(refusal.code);

      env.release();
      await done;
      await settle();

      const logged = [...errors.mock.calls];

      errors.mockRestore();

      expect(logged).toStrictEqual([]);
      expect(outcome(env, inFlight.destination)).toStrictEqual(control);

      env.router.stop();
    });
  });

  it("a SAME_STATES refusal on the route a Back in flight goes to, with other params", async () => {
    async function back(
      refuse: boolean,
    ): Promise<{ refusal: string | undefined; result: Outcome }> {
      const env = createUnstartedEnv(`${ORIGIN}/item/1`, {
        allowNotFound: true,
      });

      await env.router.start("/item/1");
      await env.router.navigate("item", { id: "2" });
      env.reads.clear();
      env.hold("item");

      const done = finished(env.mock.back());

      await settle();

      const refusal = refuse
        ? await codeOf(env.router.navigate("item", { id: "2" }))
        : undefined;

      env.release();
      await done;
      await settle();

      const result = outcome(env, "item");

      env.router.stop();

      return { refusal, result };
    }

    const control = await back(false);
    const subject = await back(true);

    expect(control.result.router).toBe("/item/1");
    expect(control.result.meta?.navigationType).toBe("traverse");
    expect(subject.refusal).toBe(errorCodes.SAME_STATES);
    expect(subject.result).toStrictEqual(control.result);
  });
});

describe("a navigation takes no record staged for another", () => {
  it("one a guard starts within traverseToLast()'s call ends as router.navigate() alone", async () => {
    const control = await alone(ROUTER_NAVIGATE);
    const env = await createEnv();

    env.redirect("about", () => {
      env.router.navigate("other").catch(noop);
    });

    await expect(codeOf(env.router.traverseToLast("about"))).resolves.toBe(
      errorCodes.TRANSITION_CANCELLED,
    );

    await settle();

    expect(outcome(env, ROUTER_NAVIGATE.destination)).toStrictEqual(control);

    env.router.stop();
  });

  it("one a canDeactivate guard starts within navigateToNotFound()'s call reads and publishes none of it", async () => {
    const control = await alone(ROUTER_NAVIGATE);
    const env = await createEnv();

    getLifecycleApi(env.router).addDeactivateGuard(
      "users.list",
      () => (toState) => {
        if (toState.name !== UNKNOWN_ROUTE) {
          return true;
        }

        env.router.navigate("other").catch(noop);

        return false;
      },
    );

    await PUSH_UNMATCHED.run(env);
    await settle();

    const result = outcome(env, ROUTER_NAVIGATE.destination);

    expect(result.router).toBe("/other");
    expect(result.read).toBe("none");
    expect(result.meta).toStrictEqual(control.meta);

    env.router.stop();
  });

  it.each([
    {
      name: "traverseToLast()",
      run: (env: Env) => env.router.traverseToLast("about"),
    },
    {
      name: "a browser navigation with info",
      run: (env: Env) =>
        finished(env.mock.navigate(`${ORIGIN}/about`, { info: "refused" })),
    },
  ])(
    "a commit that starts no transition, after $name was refused",
    async (refused) => {
      const control = await alone(PUSH_UNMATCHED);
      const env = await createEnv();

      env.deny("about");
      await codeOf(refused.run(env));
      await settle();

      // The guard ran and refused: the router stays where it was.
      expect(env.reads.has("about")).toBe(true);
      expect(env.router.getState()?.name).toBe("users.list");

      env.traversals.length = 0;
      await PUSH_UNMATCHED.run(env);
      await settle();

      expect(outcome(env, PUSH_UNMATCHED.destination)).toStrictEqual(control);

      env.router.stop();
    },
  );

  it("a commit that starts no transition, after browser.traverseTo() threw for a traverse", async () => {
    const control = await alone(PUSH_UNMATCHED);
    const env = await createEnv();

    env.breakNextTraverse();
    await codeOf(env.router.traverseToLast("home"));

    // The traverse committed and published its record; the browser refused
    // the entry.
    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "traverse",
    );
    expect(env.router.getState()?.context.url).toStrictEqual({
      hash: "",
      hashChanged: false,
    });
    expect(env.traversals).toStrictEqual(["/home"]);

    env.traversals.length = 0;
    await PUSH_UNMATCHED.run(env);
    await settle();

    expect(outcome(env, PUSH_UNMATCHED.destination)).toStrictEqual(control);

    env.router.stop();
  });

  it("a commit that starts no transition, after a navigation to a URL no route matches was refused", async () => {
    async function notFound(
      refuseFirst: boolean,
    ): Promise<{ stayedOn: string | undefined; meta: unknown }> {
      const env = await createEnv();
      let refuse = refuseFirst;
      let stayedOn: string | undefined;

      getLifecycleApi(env.router).addDeactivateGuard(
        "users.list",
        () => (toState) => !(refuse && toState.name === UNKNOWN_ROUTE),
      );

      if (refuseFirst) {
        await PUSH_UNMATCHED.run(env);
        await settle();
        stayedOn = env.router.getState()?.name;
        refuse = false;
      }

      env.router.navigateToNotFound("/missing");

      const meta = env.router.getState()?.context.navigation;

      env.router.stop();

      return { stayedOn, meta };
    }

    const control = await notFound(false);
    const subject = await notFound(true);

    expect(control.meta).toMatchObject({ navigationType: "replace" });
    // Refused: the router stayed where it was.
    expect(subject.stayedOn).toBe("users.list");
    expect(subject.meta).toStrictEqual(control.meta);
  });

  it("a transition an earlier listener of its start ended leaves none for the next commit", async () => {
    let stopOn: string | undefined;
    const env = createUnstartedEnv(`${ORIGIN}/home`, {
      allowNotFound: true,
      before: (router) => {
        router.usePlugin(() => ({
          onTransitionStart: (toState: State) => {
            if (toState.name === stopOn) {
              stopOn = undefined;
              router.stop();
            }
          },
        }));
      },
    });

    await env.router.start("/home");
    await env.router.navigate("about");
    await env.router.navigate("home");
    stopOn = "about";

    await expect(codeOf(env.router.traverseToLast("about"))).resolves.toBe(
      errorCodes.TRANSITION_CANCELLED,
    );

    env.traversals.length = 0;
    await env.router.start("/nope");

    expect(env.router.getState()?.name).toBe(UNKNOWN_ROUTE);
    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "replace",
    );
    expect(env.traversals).toStrictEqual([]);

    env.router.stop();
  });

  it("a refused navigation the browser handles within traverseToLast()'s call leaves its record", async () => {
    let armed = false;
    let navigateInCall: (url: string) => void = noop;
    const env = createUnstartedEnv(`${ORIGIN}/home`, {
      allowNotFound: true,
      before: (router) => {
        router.usePlugin(() => ({
          onTransitionStart: () => {
            if (armed) {
              armed = false;
              navigateInCall(`${ORIGIN}/home`);
            }
          },
        }));
      },
    });

    navigateInCall = env.navigateInCall;

    await env.router.start("/home");
    await env.router.navigate("about");
    await env.router.navigate("home");
    env.traversals.length = 0;
    armed = true;

    await env.router.traverseToLast("about");

    expect(env.traversals).toStrictEqual(["/about"]);
    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "traverse",
    );

    env.router.stop();
  });

  it("a transition an earlier listener of its start ended, refused a restart there, leaves none for the next commit", async () => {
    let stopOn: string | undefined;
    let refused: string | undefined;
    const env = createUnstartedEnv(`${ORIGIN}/home`, {
      allowNotFound: true,
      before: (router) => {
        router.usePlugin(() => ({
          onTransitionStart: (toState: State) => {
            if (toState.name === stopOn) {
              stopOn = undefined;
              refused = restartInside(router, "/other");
            }
          },
        }));
      },
    });

    await env.router.start("/home");
    await env.router.navigate("about");
    await env.router.navigate("home");
    stopOn = "about";

    await expect(codeOf(env.router.traverseToLast("about"))).resolves.toBe(
      errorCodes.TRANSITION_CANCELLED,
    );

    await settle();

    expect(refused).toBe(errorCodes.REENTRANT_NAVIGATION);

    env.traversals.length = 0;
    await env.router.start("/nope");

    expect(env.router.getState()?.name).toBe(UNKNOWN_ROUTE);
    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "replace",
    );
    expect(env.traversals).toStrictEqual([]);

    env.router.stop();
  });

  it("a browser navigation an earlier listener of its start aborted leaves none for the next commit", async () => {
    const control = await createEnv();

    control.router.navigateToNotFound("/gone");

    const derived = control.router.getState()?.context.navigation;

    control.router.stop();

    let abort: () => void = noop;
    let abortOn: string | undefined;
    const env = createUnstartedEnv(`${ORIGIN}/home`, {
      allowNotFound: true,
      before: (router) => {
        router.usePlugin(() => ({
          onTransitionStart: (toState: State) => {
            if (toState.name === abortOn) {
              abortOn = undefined;
              abort();
            }
          },
        }));
      },
    });

    // A navigation that leaves the document for a URL no route matches: the
    // browser performs it, and it aborts the navigation in flight.
    abort = () => {
      void finished(env.mock.navigate(`${ORIGIN}/away`));
    };

    await env.router.start("/home");
    await env.router.navigate("users.list");
    abortOn = "about";
    await finished(env.mock.navigate(`${ORIGIN}/about`, { info: "aborted" }));
    await settle();

    expect(abortOn).toBeUndefined();
    expect(env.router.getState()?.path).toBe("/users/list");

    env.router.navigateToNotFound("/gone");

    expect(derived).toMatchObject({ navigationType: "replace" });
    expect(env.router.getState()?.context.navigation).toStrictEqual(derived);

    env.router.stop();
  });

  it("a restart refused inside a listener of a refusal within traverseToLast()'s call leaves none for the router's next start", async () => {
    let restart = false;
    let refused: string | undefined;
    const env = createUnstartedEnv(`${ORIGIN}/home`, {
      allowNotFound: true,
      before: (router) => {
        router.usePlugin(() => ({
          onTransitionError: () => {
            if (restart) {
              restart = false;
              refused = restartInside(router, "/other");
            }
          },
        }));
      },
    });

    await env.router.start("/home");
    await env.router.navigate("about");
    await env.router.navigate("home");
    restart = true;

    // The last `home` entry before the current one: SAME_STATES, an error
    // within traverseToLast()'s call.
    await expect(codeOf(env.router.traverseToLast("home"))).resolves.toBe(
      errorCodes.SAME_STATES,
    );

    await settle();

    expect(refused).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(env.reads.has("other")).toBe(false);

    env.traversals.length = 0;
    await env.router.start("/nope");

    expect(env.router.getState()?.name).toBe(UNKNOWN_ROUTE);
    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "replace",
    );
    expect(env.traversals).toStrictEqual([]);

    env.router.stop();
  });

  // A guard is the code a staging call runs that may still restart the router:
  // core refuses a restart from a router notification (#2778), not from a guard.
  it("a restart from a guard of traverseToLast()'s transition, held by a guard, takes none of its record", async () => {
    const env = createUnstartedEnv(`${ORIGIN}/home`, { allowNotFound: true });

    await env.router.start("/home");
    await env.router.navigate("about");
    await env.router.navigate("home");

    let restarted = false;

    env.redirect("about", () => {
      restarted = true;
      env.router.stop();
      env.hold("other");
      env.router.start("/other").catch(noop);
    });

    await expect(codeOf(env.router.traverseToLast("about"))).resolves.toBe(
      errorCodes.TRANSITION_CANCELLED,
    );

    await settle();

    expect(restarted).toBe(true);

    env.traversals.length = 0;
    env.release();
    await settle();

    expect(env.router.getState()?.name).toBe("other");
    expect(env.reads.get("other")).toBe("none");
    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "replace",
    );
    expect(env.traversals).toStrictEqual([]);
    expect(pathOf(env.mock.currentUrl)).toBe("/other");

    env.router.stop();
  });

  // The logger's callback is code core runs inside a staging call, before
  // the call's transition starts, that core does not refuse a restart from.
  // `onStart` keeps the restart's start transition from taking the record.
  it("a restart from the logger's callback inside traverseToLast()'s call takes none of its record", async () => {
    let restartOnWarn = false;
    let restarted = false;
    let router: Router | undefined;
    const env = createUnstartedEnv(`${ORIGIN}/home`, {
      allowNotFound: true,
      logger: {
        level: "none",
        callbackIgnoresLevel: true,
        callback: (level) => {
          if (level !== "warn" || !restartOnWarn || router === undefined) {
            return;
          }

          restartOnWarn = false;
          restarted = true;
          router.stop();
          router.start("/other").catch(noop);
        },
      },
    });

    router = env.router;

    await env.router.start("/home");
    await env.router.navigate("about");
    await env.router.navigate("home");
    await env.router.navigate("users.list");
    env.reads.clear();
    env.traversals.length = 0;
    env.hold("slow");

    const superseded = codeOf(env.router.navigate("slow"));

    await settle();
    // traverseToLast() supersedes `slow`: core warns of the concurrent
    // navigation before it cancels `slow`.
    restartOnWarn = true;
    await codeOf(env.router.traverseToLast("about"));
    await superseded;
    await settle();

    expect(restarted).toBe(true);
    expect(env.reads.get("other")).toBe("none");
    expect(env.traversals).toStrictEqual([]);

    env.release();
    await settle();
    env.router.stop();
  });

  // Subscribed before the plugin, the listener runs ahead of the plugin's
  // onTransitionSuccess for the transition whose success core is emitting.
  it("a traverseToLast() whose success an earlier listener interrupts with a refused restart publishes its own record", async () => {
    let restartOn: string | undefined;
    let refused: string | undefined;
    const env = createUnstartedEnv(`${ORIGIN}/home`, {
      allowNotFound: true,
      before: (router) => {
        router.subscribe(({ route }) => {
          if (route.name === restartOn) {
            restartOn = undefined;
            refused = restartInside(router, "/nope");
          }
        });
      },
    });

    await env.router.start("/home");
    await env.router.navigate("about");
    await env.router.navigate("home");
    await env.router.navigate("users.list");
    env.traversals.length = 0;
    restartOn = "about";

    const arrived = await env.router.traverseToLast("about");

    await settle();

    expect(refused).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(arrived.context.navigation?.navigationType).toBe("traverse");
    expect(env.traversals).toStrictEqual(["/about"]);
    expect(env.mock.entries()).toHaveLength(4);

    env.router.stop();
  });

  // Core refuses the restart (#2778). The listener's stop() still stops the
  // router, so traverseToLast()'s call starts no transition of its own.
  it("a restart from a listener of the transition traverseToLast() supersedes is refused, and the call takes no record", async () => {
    let restartOn: string | undefined;
    let refused: string | undefined;
    const env = createUnstartedEnv(`${ORIGIN}/home`, {
      allowNotFound: true,
      before: (router) => {
        router.usePlugin(() => ({
          onTransitionCancel: (toState: State) => {
            if (toState.name === restartOn) {
              restartOn = undefined;
              refused = restartInside(router, "/other");
            }
          },
        }));
      },
    });

    await env.router.start("/home");
    await env.router.navigate("about");
    await env.router.navigate("home");
    await env.router.navigate("users.list");
    env.reads.clear();
    env.traversals.length = 0;
    env.hold("slow");

    const superseded = codeOf(env.router.navigate("slow"));

    await settle();
    restartOn = "slow";

    await expect(codeOf(env.router.traverseToLast("about"))).resolves.toBe(
      errorCodes.TRANSITION_CANCELLED,
    );
    await expect(superseded).resolves.toBe(errorCodes.TRANSITION_CANCELLED);

    expect(refused).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(env.router.getState()).toBeUndefined();
    expect(env.reads.has("about")).toBe(false);
    expect(env.traversals).toStrictEqual([]);

    env.release();
    await settle();
  });

  it("a navigation to a URL no route matches, nested in another's call, leaves the outer one its record", async () => {
    const control = await alone(PUSH_UNMATCHED);
    const env = await createEnv();
    let nest = true;

    getLifecycleApi(env.router).addDeactivateGuard(
      "users.list",
      () => (toState) => {
        if (nest && toState.path === "/nope") {
          nest = false;
          env.navigateInCall(`${ORIGIN}/nope2`);
        }

        return true;
      },
    );

    await PUSH_UNMATCHED.run(env);
    await settle();

    expect(env.router.getState()?.path).toBe("/nope");
    expect(env.router.getState()?.context.navigation).toStrictEqual(
      control.meta,
    );

    env.router.stop();
  });

  it("a browser navigation that supersedes a held browser navigation publishes its own metadata", async () => {
    const env = await createEnv();

    env.hold("slow");

    const superseded = finished(env.mock.navigate(`${ORIGIN}/slow`));

    await settle();
    await finished(
      env.mock.navigate(`${ORIGIN}/other`, { info: "superseding" }),
    );
    await settle();
    env.release();
    await superseded;
    await settle();

    expect(env.router.getState()?.name).toBe("other");
    expect(env.reads.get("other")).toMatchObject({ info: "superseding" });
    expect(env.router.getState()?.context.navigation).toMatchObject({
      navigationType: "push",
      info: "superseding",
    });

    env.router.stop();
  });

  // The boundary: the slot cannot tell an app's commit made during the
  // plugin's not-found call from the plugin's own.
  it("a commit an app makes during the plugin's not-found call takes that call's record", async () => {
    const control = await alone(PUSH_UNMATCHED);
    const env = await createEnv();
    const published: unknown[] = [];
    let nest = true;

    env.router.subscribe(({ route }) => {
      published.push([route.path, route.context.navigation]);
    });
    getLifecycleApi(env.router).addDeactivateGuard(
      "users.list",
      () => (toState) => {
        if (nest && toState.path === "/nope") {
          nest = false;
          env.router.navigateToNotFound("/elsewhere");
        }

        return true;
      },
    );

    await PUSH_UNMATCHED.run(env);
    await settle();

    expect(control.meta).toMatchObject({ navigationType: "push" });
    expect(published).toStrictEqual([
      ["/elsewhere", control.meta],
      ["/nope", control.meta],
    ]);

    env.router.stop();
  });
});

describe("the activation's record reaches the router's first transition or commit (#531)", () => {
  it("a browser navigation that supersedes the start transition publishes its own metadata", async () => {
    const env = createUnstartedEnv(`${ORIGIN}/home`, {
      allowNotFound: true,
      activation: "reload",
    });

    env.hold("home");

    const started = codeOf(env.router.start());

    await settle();
    await finished(env.mock.historyPushState(`${ORIGIN}/other`));
    await settle();
    env.release();
    await settle();

    await expect(started).resolves.toBe(errorCodes.TRANSITION_CANCELLED);
    expect(env.router.getState()?.name).toBe("other");
    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "push",
    );

    env.router.stop();
  });

  it("a start transition refused by a guard takes it along", async () => {
    const env = createUnstartedEnv(`${ORIGIN}/home`, {
      allowNotFound: true,
      activation: "reload",
    });

    env.deny("home");

    await expect(codeOf(env.router.start())).resolves.toBe(
      errorCodes.CANNOT_ACTIVATE,
    );

    await env.router.start();

    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "replace",
    );

    env.router.stop();
  });

  it("a start transition an earlier listener ended before the plugin heard it takes it along", async () => {
    let stop = true;
    const env = createUnstartedEnv(`${ORIGIN}/home`, {
      allowNotFound: true,
      activation: "reload",
      before: (router) => {
        router.usePlugin(() => ({
          onTransitionStart: () => {
            if (stop) {
              stop = false;
              router.stop();
            }
          },
        }));
      },
    });

    await expect(codeOf(env.router.start("/home"))).resolves.toBe(
      errorCodes.TRANSITION_CANCELLED,
    );

    await env.router.start("/nope");

    expect(env.router.getState()?.name).toBe(UNKNOWN_ROUTE);
    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "replace",
    );

    env.router.stop();
  });

  it("a start transition that committed leaves none for a start after stop()", async () => {
    const env = createUnstartedEnv(`${ORIGIN}/home`, {
      allowNotFound: true,
      activation: "reload",
    });

    await env.router.start("/home");

    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "reload",
    );

    env.router.stop();
    await env.router.start("/nope");

    expect(env.router.getState()?.name).toBe(UNKNOWN_ROUTE);
    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "replace",
    );

    env.router.stop();
  });

  it("the start transition whose success an earlier listener interrupts with a refused restart publishes it", async () => {
    let restart = true;
    let refused: string | undefined;
    const env = createUnstartedEnv(`${ORIGIN}/home`, {
      allowNotFound: true,
      activation: "reload",
      before: (router) => {
        router.subscribe(() => {
          if (restart) {
            restart = false;
            refused = restartInside(router, "/home");
          }
        });
      },
    });

    const first = await env.router.start("/home");

    await settle();

    expect(refused).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(first.context.navigation?.navigationType).toBe("reload");

    env.router.stop();
  });

  it("a start that commits a URL no route matches consumes it", async () => {
    const env = createUnstartedEnv(`${ORIGIN}/nope`, {
      allowNotFound: true,
      activation: "reload",
    });

    await env.router.start();

    expect(env.router.getState()?.name).toBe(UNKNOWN_ROUTE);
    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "reload",
    );

    // Derived: a navigation from UNKNOWN_ROUTE replaces.
    await env.router.navigate("home");

    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "replace",
    );

    env.router.stop();
  });

  it("a start refused before a transition begins leaves it to the next start", async () => {
    const env = createUnstartedEnv(`${ORIGIN}/nope`, {
      allowNotFound: false,
      activation: "reload",
    });

    await expect(codeOf(env.router.start())).resolves.toBe(
      errorCodes.ROUTE_NOT_FOUND,
    );

    await env.router.start("/home");

    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "reload",
    );

    env.router.stop();
  });

  it("a traverseToLast() refused before the router starts leaves it", async () => {
    const env = createUnstartedEnv(`${ORIGIN}/home`, {
      allowNotFound: true,
      activation: "reload",
    });

    env.mock.historyPushState(`${ORIGIN}/about`);
    env.mock.historyPushState(`${ORIGIN}/home`);

    await expect(codeOf(env.router.traverseToLast("about"))).resolves.toBe(
      errorCodes.ROUTER_NOT_STARTED,
    );

    await env.router.start();

    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "reload",
    );

    env.router.stop();
  });

  it("a refused navigation the browser handles in another plugin's onStart leaves it", async () => {
    let navigateInCall: (url: string) => void = noop;
    const env = createUnstartedEnv(`${ORIGIN}/home`, {
      allowNotFound: true,
      activation: "reload",
    });

    env.router.usePlugin(() => ({
      onStart: () => {
        navigateInCall(`${ORIGIN}/home`);
      },
    }));
    navigateInCall = env.navigateInCall;

    await env.router.start();

    expect(env.reads.get("home")).toMatchObject({ navigationType: "reload" });
    expect(env.router.getState()?.context.navigation?.navigationType).toBe(
      "reload",
    );

    env.router.stop();
  });

  it("a plugin installed after the router's first commit primes nothing", async () => {
    const mock = new MockNavigation(`${ORIGIN}/home`);

    mock.activation = {
      entry: mock.currentEntry!,
      from: null,
      navigationType: "reload",
    };

    const router = createRouter(
      [
        { name: "home", path: "/home" },
        { name: "about", path: "/about" },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/home");
    router.usePlugin(
      navigationPluginFactory({}, createMockNavigationBrowser(mock)),
    );
    await router.navigate("about");

    expect(router.getState()?.context.navigation?.navigationType).toBe("push");

    router.stop();
  });

  it("a plugin installed on a router stopped after its first commit primes nothing", async () => {
    const mock = new MockNavigation(`${ORIGIN}/home`);

    mock.activation = {
      entry: mock.currentEntry!,
      from: null,
      navigationType: "reload",
    };

    const router = createRouter(
      [
        { name: "home", path: "/home" },
        { name: "about", path: "/about" },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/home");
    router.stop();
    router.usePlugin(
      navigationPluginFactory({}, createMockNavigationBrowser(mock)),
    );
    await router.start("/home");

    expect(router.getState()?.context.navigation?.navigationType).toBe(
      "replace",
    );

    router.stop();
  });

  // The boundary of the rule above: the plugin asks the router for a current
  // and a previous state, and a start that commits nothing leaves neither.
  it("a plugin installed after a restart that committed nothing primes it", async () => {
    const mock = new MockNavigation(`${ORIGIN}/home`);

    mock.activation = {
      entry: mock.currentEntry!,
      from: null,
      navigationType: "reload",
    };

    const router = createRouter(
      [
        { name: "home", path: "/home" },
        { name: "about", path: "/about", canActivate: () => () => false },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/home");
    router.stop();

    await expect(codeOf(router.start("/about"))).resolves.toBe(
      errorCodes.CANNOT_ACTIVATE,
    );
    expect([router.getState(), router.getPreviousState()]).toStrictEqual([
      undefined,
      undefined,
    ]);

    router.usePlugin(
      navigationPluginFactory({}, createMockNavigationBrowser(mock)),
    );
    await router.start("/home");

    expect(router.getState()?.context.navigation?.navigationType).toBe(
      "reload",
    );

    router.stop();
  });
});
