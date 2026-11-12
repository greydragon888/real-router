import { fc, test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import {
  arbActiveOptions,
  arbNavigationSeq,
  arbNodeName,
  arbRouteName,
  createStartedRouter,
  NUM_RUNS,
} from "./helpers";
import * as api from "../../src";

import type { NavigationAction } from "./helpers";
import type { RouterSource } from "../../src";
import type { Router, State } from "@real-router/core";

// A lazy source with no listener holds no router subscription, and React's
// `useSyncExternalStore` reads it during render before it subscribes (#2909).
// For every lazy source: that read shows what the router shows, a second read
// returns the same reference, the subscribe after it notifies nobody, and a
// navigation the source did not see leaves `previousRoute` unknown.
//
// A subscribe that no read precedes is notified of the catch-up, and that is
// held elsewhere: "reconnect reconcile (#765)" in `routeSource.properties.ts`,
// the re-subscribe cells of `activeRouteSource.properties.ts` and
// `createDismissableError.properties.ts`, and for the node source the unit
// cells of `createRouteNodeStore.test.ts`.

interface RowArgs {
  readonly nodeName: string;
  readonly routeName: string;
  readonly options: {
    strict?: boolean;
    ignoreQueryParams?: boolean;
    hash?: string;
  };
}

interface LazyRow {
  // Generated arguments, for a row that needs a narrower domain than arbArgs.
  readonly args?: fc.Arbitrary<RowArgs>;
  readonly make: (router: Router, args: RowArgs) => RouterSource<unknown>;
  // Whether `snapshot` is what the router shows now.
  readonly isCurrent: (
    router: Router,
    snapshot: unknown,
    args: RowArgs,
  ) => boolean;
  // Route snapshots carry `previousRoute`; the others do not.
  readonly hasPreviousRoute: boolean;
  // A source whose router listener takes every announcement keeps, with
  // nothing missed, the very snapshot it held at disconnect.
  readonly takesEveryAnnouncement: (args: RowArgs) => boolean;
}

function sameRoute(a: State | undefined, b: State | undefined): boolean {
  return a?.path === b?.path && a?.name === b?.name;
}

function nodeRouteOf(
  state: State | undefined,
  nodeName: string,
): State | undefined {
  return nodeName === "" ||
    (state !== undefined &&
      (state.name === nodeName || state.name.startsWith(`${nodeName}.`)))
    ? state
    : undefined;
}

// `createActiveSource` answers default options from the name selector, whose
// rule is the route name or a descendant — not `isActiveRoute`, which also
// asks for the route's required params.
function takesNameSelector({ routeName, options }: RowArgs): boolean {
  return (
    routeName !== "" &&
    options.strict !== true &&
    options.ignoreQueryParams !== false &&
    options.hash === undefined
  );
}

function isNameActive(router: Router, routeName: string): boolean {
  const name = router.getState()?.name;

  return name === routeName || (name?.startsWith(`${routeName}.`) ?? false);
}

function isActiveNow(router: Router, { routeName, options }: RowArgs): boolean {
  return (
    router.isActiveRoute(
      routeName,
      undefined,
      undefined,
      options.strict ?? false,
      options.ignoreQueryParams ?? true,
    ) &&
    // No URL plugin in the fixture: the fragment reads as "".
    (options.hash === undefined || options.hash === "")
  );
}

const arbArgs: fc.Arbitrary<RowArgs> = fc.record({
  nodeName: arbNodeName,
  routeName: arbRouteName,
  options: arbActiveOptions,
});

// Without a URL plugin a non-empty fragment pins the flag, and the oracle, to
// false, so a run that draws one cannot catch a stale read: the boolean rows
// draw "" or no fragment.
const arbArgsWithoutFragment: fc.Arbitrary<RowArgs> = arbArgs.map(
  ({ options: { hash, ...options }, ...args }) => ({
    ...args,
    options: hash === undefined ? options : { ...options, hash: "" },
  }),
);

const LAZY: Readonly<Record<string, LazyRow>> = {
  createRouteNodeSource: {
    make: (router, { nodeName }) => api.createRouteNodeSource(router, nodeName),
    isCurrent: (router, snapshot, { nodeName }) =>
      sameRoute(
        (snapshot as { route: State | undefined }).route,
        nodeRouteOf(router.getState(), nodeName),
      ),
    hasPreviousRoute: true,
    // A nested node's listener drops the navigations that do not touch it.
    takesEveryAnnouncement: ({ nodeName }) => nodeName === "",
  },
  createRouteSource: {
    make: (router) => api.createRouteSource(router),
    isCurrent: (router, snapshot) =>
      sameRoute(
        (snapshot as { route: State | undefined }).route,
        router.getState(),
      ),
    hasPreviousRoute: true,
    takesEveryAnnouncement: () => true,
  },
  createActiveRouteSource: {
    args: arbArgsWithoutFragment,
    make: (router, { routeName, options }) =>
      api.createActiveRouteSource(
        router,
        routeName,
        undefined,
        undefined,
        options,
      ),
    isCurrent: (router, snapshot, args) =>
      snapshot === isActiveNow(router, args),
    hasPreviousRoute: false,
    takesEveryAnnouncement: () => false,
  },
  // Default options take the name-selector branch, any other the
  // createActiveRouteSource one: the generated options reach both.
  createActiveSource: {
    args: arbArgsWithoutFragment,
    make: (router, { routeName, options }) =>
      api.createActiveSource(
        router,
        routeName,
        undefined,
        undefined,
        options.strict ?? false,
        options.ignoreQueryParams ?? true,
        options.hash,
      ),
    isCurrent: (router, snapshot, args) =>
      snapshot ===
      (takesNameSelector(args)
        ? isNameActive(router, args.routeName)
        : isActiveNow(router, args)),
    hasPreviousRoute: false,
    takesEveryAnnouncement: () => false,
  },
  createDismissableError: {
    make: (router) => api.createDismissableError(router),
    isCurrent: (router, snapshot) => {
      const shown = snapshot as { error: unknown; version: number };
      const underlying = api.getErrorSource(router).getSnapshot();

      return (
        shown.error === underlying.error &&
        (shown.error === null || shown.version === underlying.version)
      );
    },
    hasPreviousRoute: false,
    takesEveryAnnouncement: () => true,
  },
};

// Every other function the package root exports, and why the
// read-before-subscribe question does not apply to it. A new function export of
// the root fails the census below until it is classified here or in LAZY; one
// on another entry point or inside an exported object is out of its reach.
// "every NOT_LAZY reason holds" checks each reason.
const NOT_LAZY: Readonly<Record<string, string>> = {
  createTransitionSource:
    "eager — subscribed to router events from construction",
  getTransitionSource: "eager — the cached createTransitionSource",
  createErrorSource: "eager — subscribed to router events from construction",
  getErrorSource: "eager — the cached createErrorSource",
  primeErrorSource: "returns nothing — creates the eager error source",
  createActiveNameSelector:
    "no getSnapshot — isActive computes on demand for a name with no listener",
  normalizeActiveOptions: "not a source",
  canonicalJson: "not a source",
  createRouteEnterGate: "not a source — a decision closure",
  guardLeaveListener: "not a source — a subscribeLeave listener wrapper",
};

async function navigateAll(
  router: Router,
  navs: readonly NavigationAction[],
): Promise<void> {
  for (const nav of navs) {
    // SAME_STATES reaches the error source, which the dismissable row reads.
    await router.navigate(nav.name, nav.params, nav.search).catch(() => {});
  }
}

// Whether `make` leaves no free listener slot on a router that has one: an
// eager factory registers at construction, a lazy one at its first subscribe.
async function takesTheSlot(
  make: (router: Router) => unknown,
): Promise<boolean> {
  const router = createRouter([{ name: "home", path: "/" }], {
    limits: { maxListeners: 1 },
  });

  await router.start("/");
  make(router);

  let taken = false;

  try {
    router.subscribe(() => {});
  } catch {
    taken = true;
  }

  router.dispose();

  return taken;
}

// Whether `factory`, given a router, returns no source. One that refuses a
// router (`canonicalJson` does) returns none.
function returnsNoSource(
  factory: (router: Router) => unknown,
  router: Router,
): boolean {
  try {
    const result = factory(router) as { getSnapshot?: unknown } | undefined;

    return typeof result?.getSnapshot !== "function";
  } catch {
    return true;
  }
}

describe("lazy sources — the read before the first subscribe (#2909)", () => {
  it("every exported function is classified", () => {
    const byName = (a: string, b: string): number => a.localeCompare(b);
    const exported = Object.entries(api)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)
      .toSorted(byName);

    expect(exported).toStrictEqual(
      [...Object.keys(LAZY), ...Object.keys(NOT_LAZY)].toSorted(byName),
    );
  });

  // An "eager" reason says the factory registers on the router at
  // construction; any other says it returns no source.
  it("every NOT_LAZY reason holds", async () => {
    const exported: Readonly<Record<string, unknown>> = api;
    const router = await createStartedRouter();
    const wrong: string[] = [];

    // Each probe answers differently for a lazy factory.
    expect([
      await takesTheSlot(api.createErrorSource),
      await takesTheSlot(api.createRouteSource),
      returnsNoSource(api.createRouteSource, router),
    ]).toStrictEqual([true, false, false]);

    for (const [name, reason] of Object.entries(NOT_LAZY)) {
      const factory = exported[name] as (router: Router) => unknown;
      const holds = reason.startsWith("eager")
        ? await takesTheSlot(factory)
        : returnsNoSource(factory, router);

      if (!holds) {
        wrong.push(name);
      }
    }

    router.dispose();

    expect(wrong).toStrictEqual([]);
  });

  // A run can catch a stale read only when the snapshot the source held at
  // disconnect is no longer what the router shows: for every row, some
  // generated runs are such runs.
  it("for every row, some generated runs leave the held snapshot stale", async () => {
    const neverStale: string[] = [];

    for (const [name, row] of Object.entries(LAZY)) {
      let stale = 0;

      for (const [args, connected, missed] of fc.sample(
        fc.tuple(row.args ?? arbArgs, arbNavigationSeq, arbNavigationSeq),
        { numRuns: 30, seed: 2909 },
      )) {
        const router = await createStartedRouter();
        const source = row.make(router, args);
        const unsubscribe = source.subscribe(() => {});

        await navigateAll(router, connected);

        const held = source.getSnapshot();

        unsubscribe();
        await navigateAll(router, missed);

        if (!row.isCurrent(router, held, args)) {
          stale++;
        }

        router.dispose();
      }

      if (stale === 0) {
        neverStale.push(name);
      }
    }

    expect(neverStale).toStrictEqual([]);
  });

  for (const [name, row] of Object.entries(LAZY)) {
    test.prop([row.args ?? arbArgs, arbNavigationSeq, arbNavigationSeq], {
      numRuns: NUM_RUNS.async,
    })(
      `${name}: the read shows the router, keeps one reference, and the subscribe after it notifies nobody`,
      async (args, connected, missed) => {
        const router = await createStartedRouter();
        const source = row.make(router, args);
        const unsubscribe = source.subscribe(() => {});

        await navigateAll(router, connected);
        unsubscribe();

        const atDisconnect = router.getState();

        await navigateAll(router, missed);

        const read = source.getSnapshot();

        expect(row.isCurrent(router, read, args)).toBe(true);
        expect(source.getSnapshot()).toBe(read);

        if (row.hasPreviousRoute && router.getState() !== atDisconnect) {
          expect(
            (read as { previousRoute: State | undefined }).previousRoute,
          ).toBeUndefined();
        }

        let calls = 0;

        source.subscribe(() => {
          calls++;
        });

        expect(calls).toBe(0);
        expect(source.getSnapshot()).toBe(read);

        router.dispose();
      },
    );

    test.prop([row.args ?? arbArgs, arbNavigationSeq], {
      numRuns: NUM_RUNS.async,
    })(
      `${name}: with nothing missed, the read shows the router and keeps the snapshot a source taking every announcement held`,
      async (args, connected) => {
        const router = await createStartedRouter();
        const source = row.make(router, args);
        const unsubscribe = source.subscribe(() => {});

        await navigateAll(router, connected);

        const held = source.getSnapshot();

        unsubscribe();

        const read = source.getSnapshot();

        expect(row.isCurrent(router, read, args)).toBe(true);

        if (row.takesEveryAnnouncement(args)) {
          expect(read).toBe(held);
        }

        router.dispose();
      },
    );
  }
});
