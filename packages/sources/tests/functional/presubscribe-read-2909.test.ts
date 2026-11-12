import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createActiveRouteSource,
  createActiveSource,
  createDismissableError,
  createRouteNodeSource,
  createRouteSource,
  getErrorSource,
} from "../../src";

import type { Router } from "@real-router/core";

// `useSyncExternalStore` reads `getSnapshot()` during render, BEFORE it
// subscribes, and Preact's polyfill seeds its state the same way. A lazy source
// is disconnected while it has no listener, so a read in that window must
// answer from the router, not from the snapshot it held at disconnect (#2909).
describe("lazy sources — a read before the first subscribe (#2909)", () => {
  let router: Router | undefined;

  afterEach(() => {
    router?.dispose();
    router = undefined;
  });

  async function started(path: string): Promise<Router> {
    const instance = createRouter(
      [
        { name: "contacts", path: "/contacts" },
        { name: "cars", path: "/cars" },
        {
          name: "catalog",
          path: "/catalog",
          children: [
            { name: "list", path: "/list" },
            { name: "slug", path: "/:slug" },
          ],
        },
        {
          name: "blocked",
          path: "/blocked",
          canActivate: () => () => false,
        },
      ],
      { defaultRoute: "contacts" },
    );

    router = instance;
    await instance.start(path);

    return instance;
  }

  // Mounted, then unmounted: the cached source keeps its snapshot and drops its
  // router subscription.
  function disconnect(source: { subscribe: (l: () => void) => () => void }) {
    source.subscribe(() => {})();
  }

  describe("a navigation while disconnected", () => {
    it("createRouteNodeSource(''): the read returns the router's route", async () => {
      const instance = await started("/contacts");
      const source = createRouteNodeSource(instance, "");

      disconnect(source);
      await instance.navigate("cars");

      expect(source.getSnapshot().route?.name).toBe("cars");
    });

    it("createRouteNodeSource('catalog'): the read follows a move inside the node", async () => {
      const instance = await started("/catalog/a");
      const source = createRouteNodeSource(instance, "catalog");

      disconnect(source);
      await instance.navigate("catalog.list");

      expect(source.getSnapshot().route?.name).toBe("catalog.list");
    });

    it("createRouteNodeSource('catalog'): the read is inactive once the router left the node", async () => {
      const instance = await started("/catalog/a");
      const source = createRouteNodeSource(instance, "catalog");

      disconnect(source);
      await instance.navigate("cars");

      expect(source.getSnapshot().route).toBeUndefined();
    });

    // A missed navigation that leaves the source showing what it showed keeps
    // the very snapshot, so a consumer comparing references does not re-render.
    it("createRouteNodeSource('catalog'): a navigation elsewhere keeps the inactive snapshot", async () => {
      const instance = await started("/contacts");
      const source = createRouteNodeSource(instance, "catalog");
      const held = source.getSnapshot();

      disconnect(source);
      await instance.navigate("cars");

      expect(held.route).toBeUndefined();
      expect(source.getSnapshot()).toBe(held);
    });

    it("createRouteNodeSource('catalog'): an inactive node drops its previousRoute after a navigation it did not take", async () => {
      const instance = await started("/catalog/list");
      const source = createRouteNodeSource(instance, "catalog");
      const unsubscribe = source.subscribe(() => {});

      await instance.navigate("contacts");

      const held = source.getSnapshot();

      unsubscribe();
      await instance.navigate("cars");

      expect(held.route).toBeUndefined();
      expect(held.previousRoute?.name).toBe("catalog.list");
      expect(source.getSnapshot()).toStrictEqual({
        route: undefined,
        previousRoute: undefined,
      });
    });

    it("createRouteNodeSource: a source created before start() reads the started route", async () => {
      const instance = createRouter([{ name: "cars", path: "/cars" }]);

      router = instance;
      const source = createRouteNodeSource(instance, "");

      await instance.start("/cars");

      expect(source.getSnapshot().route?.name).toBe("cars");
    });

    // Created before start(), the source has computed against no router state;
    // a later stop() returns the router to that, so only a read that recorded
    // the started state tells the two apart.
    it("createRouteSource and createRouteNodeSource(''): a source created before start() follows start and stop while disconnected", async () => {
      const instance = createRouter([{ name: "cars", path: "/cars" }]);

      router = instance;
      const sources = [
        createRouteSource(instance),
        createRouteNodeSource(instance, ""),
      ];

      await instance.start("/cars");

      const afterStart = sources.map(
        (source) => source.getSnapshot().route?.name,
      );

      instance.stop();

      expect(afterStart).toStrictEqual(["cars", "cars"]);
      expect(sources.map((source) => source.getSnapshot().route)).toStrictEqual(
        [undefined, undefined],
      );
    });

    // Created after start(), the source computed its snapshot against the
    // started state, and stop() leaves the router on no state at all: an
    // unread source tells the two apart only if its memo began at that state.
    it("createRouteSource, createRouteNodeSource('') and ('cars'): a source created after start() and never read reads no route once the router stops", async () => {
      const instance = await started("/cars");
      const sources = [
        createRouteSource(instance),
        createRouteNodeSource(instance, ""),
        createRouteNodeSource(instance, "cars"),
      ];

      instance.stop();

      expect(sources.map((source) => source.getSnapshot().route)).toStrictEqual(
        [undefined, undefined, undefined],
      );
    });

    it("createRouteSource: the read returns the router's route", async () => {
      const instance = await started("/contacts");
      const source = createRouteSource(instance);

      disconnect(source);
      await instance.navigate("cars");

      expect(source.getSnapshot().route?.name).toBe("cars");
    });

    it("createActiveRouteSource: the read follows a flip while disconnected", async () => {
      const instance = await started("/contacts");
      const source = createActiveRouteSource(instance, "cars");

      disconnect(source);
      await instance.navigate("cars");

      expect(source.getSnapshot()).toBe(true);
    });

    it("createActiveRouteSource: a never-subscribed source follows a flip after creation", async () => {
      const instance = await started("/contacts");
      const source = createActiveRouteSource(
        instance,
        "contacts",
        undefined,
        undefined,
        {
          strict: true,
        },
      );

      await instance.navigate("cars");

      expect(source.getSnapshot()).toBe(false);
    });

    // The forms createActiveSource hands to createActiveRouteSource that the
    // guard's generated rows leave out: path params, a query the verdict reads
    // and a fragment a URL plugin publishes.
    it("createActiveSource off its default-options path: a flip in params, search or hash made while disconnected is in the read", async () => {
      const instance = createRouter([
        { name: "catalog", path: "/catalog/:slug" },
        { name: "cars", path: "/cars?color" },
      ]);

      // Stands in for a URL plugin: publishes the requested fragment as
      // `state.context.url.hash`.
      instance.usePlugin(() => ({
        onTransitionSuccess: (
          toState: unknown,
          _fromState: unknown,
          opts: unknown,
        ) => {
          (toState as { context: Record<string, unknown> }).context.url =
            Object.freeze({
              hash: (opts as { hash?: string } | undefined)?.hash ?? "",
              hashChanged: true,
            });
        },
      }));
      router = instance;
      await instance.start("/catalog/a");

      const sources = [
        createActiveSource(
          instance,
          "catalog",
          { slug: "a" },
          undefined,
          false,
          true,
          undefined,
        ),
        createActiveSource(
          instance,
          "cars",
          undefined,
          { color: "red" },
          false,
          false,
          undefined,
        ),
        createActiveSource(
          instance,
          "cars",
          undefined,
          undefined,
          false,
          true,
          "top",
        ),
      ];
      const held = sources.map((source) => source.getSnapshot());

      for (const source of sources) {
        disconnect(source);
      }

      await instance.navigate("cars", undefined, { color: "red" }, {
        hash: "top",
      } as Parameters<typeof instance.navigate>[3]);

      expect(held).toStrictEqual([true, false, false]);
      expect(sources.map((source) => source.getSnapshot())).toStrictEqual([
        false,
        true,
        true,
      ]);
    });

    it("createDismissableError: an error raised while disconnected is in the read", async () => {
      const instance = await started("/contacts");
      const source = createDismissableError(instance);

      disconnect(source);
      await instance.navigate("blocked").catch(() => {});

      expect(source.getSnapshot().error?.code).toBe("CANNOT_ACTIVATE");
    });

    it("createDismissableError: an error cleared while disconnected is gone from the read", async () => {
      const instance = await started("/contacts");
      const source = createDismissableError(instance);
      const unsubscribe = source.subscribe(() => {});

      await instance.navigate("blocked").catch(() => {});

      const held = source.getSnapshot();

      unsubscribe();
      await instance.navigate("cars");

      expect(held.error?.code).toBe("CANNOT_ACTIVATE");
      expect(source.getSnapshot().error).toBeNull();
    });

    // An error the source never showed, raised and cleared while it was not
    // listening, leaves nothing to show: the subscribe tells nobody.
    it("createDismissableError: an error raised and cleared while disconnected notifies nobody", async () => {
      const instance = await started("/contacts");
      const source = createDismissableError(instance);

      disconnect(source);
      await instance.navigate("blocked").catch(() => {});
      await instance.navigate("cars");

      let calls = 0;

      source.subscribe(() => {
        calls++;
      });

      expect(getErrorSource(instance).getSnapshot().version).toBeGreaterThan(
        source.getSnapshot().version,
      );
      expect(source.getSnapshot().error).toBeNull();
      expect(calls).toBe(0);
    });

    // The route before a navigation the source did not see is not known
    // outside a subscribe payload, so the read shows none — even when the
    // router came back to the route the snapshot holds. The route is the state
    // the router made on the way back, which carries that navigation's context.
    it("createRouteNodeSource('') and createRouteSource: after a round trip the read holds the router's state and no previousRoute", async () => {
      const instance = await started("/contacts");
      const sources = [
        createRouteNodeSource(instance, ""),
        createRouteSource(instance),
      ];
      const unsubscribes = sources.map((source) => source.subscribe(() => {}));

      await instance.navigate("cars");

      const held = sources.map((source) => source.getSnapshot());

      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }

      await instance.navigate("catalog.list");
      await instance.navigate("cars");

      const state = instance.getState();

      expect(
        held.map((snapshot) => snapshot.previousRoute?.name),
      ).toStrictEqual(["contacts", "contacts"]);
      expect(held.map((snapshot) => snapshot.route === state)).toStrictEqual([
        false,
        false,
      ]);
      expect(
        sources.map((source) => source.getSnapshot().route === state),
      ).toStrictEqual([true, true]);
      expect(
        sources.map((source) => source.getSnapshot().previousRoute),
      ).toStrictEqual([undefined, undefined]);
    });

    // Core reports SAME_STATES with one reused error object, so a recurrence
    // differs from the error shown by its version, not by the object.
    it("createDismissableError: an error that recurs while disconnected shows its new route", async () => {
      const instance = await started("/contacts");
      const source = createDismissableError(instance);
      const unsubscribe = source.subscribe(() => {});

      await instance.navigate("contacts").catch(() => {});

      const held = source.getSnapshot();

      unsubscribe();
      await instance.navigate("cars");
      await instance.navigate("cars").catch(() => {});

      const read = source.getSnapshot();

      expect(held.error?.code).toBe("SAME_STATES");
      expect(read.error).toBe(held.error);
      expect(read.toRoute?.name).toBe("cars");
      expect(read.version).toBeGreaterThan(held.version);
    });

    // The flag also reads what a `forwardTo` resolves to — from a dependency,
    // from a closure — and a change there moves no router state.
    it("createActiveRouteSource: a forwardTo target changed while disconnected is in the read", async () => {
      let hasCar = false;
      const instance = createRouter([
        { name: "contacts", path: "/contacts" },
        { name: "cars", path: "/cars" },
        {
          name: "garage",
          path: "/garage",
          forwardTo: () => (hasCar ? "cars" : "contacts"),
        },
      ]);

      router = instance;
      await instance.start("/cars");

      const source = createActiveRouteSource(instance, "garage");

      disconnect(source);
      hasCar = true;

      expect(instance.isActiveRoute("garage")).toBe(true);
      expect(source.getSnapshot()).toBe(true);
    });

    // The read and the subscribe agree, so the subscriber is not told about a
    // change it already rendered: `useSyncExternalStore` commits once.
    it("a subscribe right after the read notifies nobody", async () => {
      const instance = await started("/catalog/a");
      const sources = [
        createRouteNodeSource(instance, ""),
        createRouteNodeSource(instance, "catalog"),
        createRouteSource(instance),
        createActiveRouteSource(instance, "cars"),
        createDismissableError(instance),
      ];

      for (const source of sources) {
        disconnect(source);
      }

      await instance.navigate("cars");
      await instance.navigate("blocked").catch(() => {});

      const notified = sources.map((source) => {
        let calls = 0;

        source.getSnapshot();
        source.subscribe(() => {
          calls++;
        });

        return calls;
      });

      expect(notified).toStrictEqual([0, 0, 0, 0, 0]);
    });

    it("repeated reads return one reference", async () => {
      const instance = await started("/catalog/a");
      const sources = [
        createRouteNodeSource(instance, ""),
        createRouteNodeSource(instance, "catalog"),
        createRouteSource(instance),
        createDismissableError(instance),
      ];

      for (const source of sources) {
        disconnect(source);
      }

      await instance.navigate("catalog.list");
      await instance.navigate("blocked").catch(() => {});

      for (const source of sources) {
        expect(source.getSnapshot()).toBe(source.getSnapshot());
      }
    });
  });

  describe("no navigation while disconnected", () => {
    // The router is still on the route the snapshot holds, so there is nothing
    // to catch up: a connected source would show the same snapshot.
    it("the read returns the snapshot held at disconnect", async () => {
      const instance = await started("/catalog/a");
      const sources = [
        createRouteNodeSource(instance, ""),
        createRouteNodeSource(instance, "catalog"),
        createRouteSource(instance),
      ];
      const unsubscribes = sources.map((source) => source.subscribe(() => {}));

      await instance.navigate("catalog.list");

      const held = sources.map((source) => source.getSnapshot());

      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }

      expect(
        held.map((snapshot) => snapshot.previousRoute?.name),
      ).toStrictEqual(["catalog.slug", "catalog.slug", "catalog.slug"]);

      for (const [index, source] of sources.entries()) {
        expect(source.getSnapshot()).toBe(held[index]);
      }
    });

    it("createRouteNodeSource: a re-subscribe neither notifies nor drops previousRoute", async () => {
      const instance = await started("/catalog/a");
      const source = createRouteNodeSource(instance, "catalog");
      const unsubscribe = source.subscribe(() => {});

      await instance.navigate("catalog.list");
      const held = source.getSnapshot();

      unsubscribe();
      let calls = 0;

      source.subscribe(() => {
        calls++;
      });

      expect(calls).toBe(0);
      expect(source.getSnapshot()).toBe(held);
      expect(source.getSnapshot().previousRoute?.name).toBe("catalog.slug");
    });

    // A same-path navigation without reload leaves the route source and the
    // root node source on their snapshot. The announcement is still taken, so
    // the read after a disconnect keeps the snapshot and its previousRoute.
    it("createRouteSource and createRouteNodeSource(''): an announcement that left the snapshot unchanged counts as taken", async () => {
      const instance = await started("/contacts");
      const sources = [
        createRouteNodeSource(instance, ""),
        createRouteSource(instance),
      ];
      const calls = [0, 0];
      const unsubscribes = sources.map((source, index) =>
        source.subscribe(() => {
          calls[index]++;
        }),
      );

      await instance.navigate("cars");
      await instance.navigate("cars", {}, undefined, { force: true });

      const held = sources.map((source) => source.getSnapshot());
      const before = [...calls];

      await instance.navigate("cars", {}, undefined, { force: true });

      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }

      const state = instance.getState();

      expect(calls).toStrictEqual(before);
      expect(held.map((snapshot) => snapshot.route === state)).toStrictEqual([
        false,
        false,
      ]);

      for (const [index, source] of sources.entries()) {
        expect(source.getSnapshot()).toBe(held[index]);
      }
    });
  });

  // A connected source shows what its router listener took, and that listener
  // drops some announcements. The read after a disconnect answers from the
  // router, as a source created then would.
  describe("a change the connected source did not take", () => {
    it("createActiveRouteSource: a forwardTo alias reads inactive once the router left its target", async () => {
      const instance = createRouter([
        { name: "home", path: "/", forwardTo: "cars" },
        { name: "cars", path: "/cars" },
        { name: "contacts", path: "/contacts" },
      ]);

      router = instance;
      await instance.start("/");

      const source = createActiveRouteSource(instance, "home");
      const unsubscribe = source.subscribe(() => {});

      await instance.navigate("contacts");

      const connected = source.getSnapshot();

      unsubscribe();

      expect(connected).toBe(true);
      expect(instance.isActiveRoute("home")).toBe(false);
      expect(source.getSnapshot()).toBe(false);
    });

    // `stop()` announces nothing, so a connected source keeps its flag; the
    // read after its last listener left answers from the stopped router.
    it("createActiveRouteSource: a source connected when the router stopped reads inactive after its last listener left", async () => {
      const instance = await started("/cars");
      const source = createActiveRouteSource(instance, "cars");
      const unsubscribe = source.subscribe(() => {});

      instance.stop();

      const connected = source.getSnapshot();

      unsubscribe();

      expect(connected).toBe(true);
      expect(instance.getState()).toBeUndefined();
      expect(source.getSnapshot()).toBe(false);
    });

    it("createRouteNodeSource: a move below the node's intersection is in the read", async () => {
      const instance = createRouter([
        {
          name: "shop",
          path: "/shop",
          children: [
            {
              name: "catalog",
              path: "/catalog",
              children: [
                { name: "list", path: "/list" },
                { name: "item", path: "/:id" },
              ],
            },
          ],
        },
      ]);

      router = instance;
      await instance.start("/shop/catalog/list");

      const source = createRouteNodeSource(instance, "shop");
      const unsubscribe = source.subscribe(() => {});

      // The intersection is shop.catalog: the listener of node "shop" drops it.
      await instance.navigate("shop.catalog.item", { id: "1" });

      const connected = source.getSnapshot().route?.name;

      unsubscribe();

      expect(connected).toBe("shop.catalog.list");
      expect(source.getSnapshot().route?.name).toBe("shop.catalog.item");
    });

    // Core calls every listener registered when an announcement began, so a
    // source's own router listener still runs after an earlier listener took
    // the source's last listener away and stopped the router. The source then
    // has no listener, and its read answers from the stopped router.
    it("createRouteSource, createRouteNodeSource('') and ('cars'): an announcement that outlives the last unsubscribe leaves the read on the router", async () => {
      const instance = await started("/contacts");
      const sources = [
        createRouteSource(instance),
        createRouteNodeSource(instance, ""),
        createRouteNodeSource(instance, "cars"),
      ];
      let unsubscribes: (() => void)[] = [];

      instance.subscribe(() => {
        for (const unsubscribe of unsubscribes) {
          unsubscribe();
        }

        unsubscribes = [];
        instance.stop();
      });

      const subscribe = instance.subscribe.bind(instance);
      let reached = 0;

      // Counts the sources' own router listeners, which the announcement must
      // reach after the unsubscribe for the cell to ask its question.
      vi.spyOn(instance, "subscribe").mockImplementation((listener) =>
        subscribe((state) => {
          reached++;
          listener(state);
        }),
      );
      unsubscribes = sources.map((source) => source.subscribe(() => {}));

      await instance.navigate("cars");

      expect(reached).toBe(3);
      expect(instance.getState()).toBeUndefined();
      expect(sources.map((source) => source.getSnapshot().route)).toStrictEqual(
        [undefined, undefined, undefined],
      );
    });
  });

  // The router refuses the subscription — a listener cap here, a disposed
  // router alike.
  describe("a connect that throws", () => {
    it("createRouteSource: the source stays disconnected and its reads follow the router", async () => {
      const instance = createRouter(
        [
          { name: "contacts", path: "/contacts" },
          { name: "cars", path: "/cars" },
        ],
        { limits: { maxListeners: 1 } },
      );

      router = instance;
      await instance.start("/contacts");

      const source = createRouteSource(instance);

      instance.subscribe(() => {});

      expect(() => source.subscribe(() => {})).toThrow();

      await instance.navigate("cars");

      expect(source.getSnapshot().route?.name).toBe("cars");
    });
  });

  describe("what the read must leave alone", () => {
    // A read repeated without a navigation returns the flag it computed: no
    // second `isActiveRoute`, so no second warning or `forwardTo` call.
    it("createActiveRouteSource: repeated reads and the subscribe compute the flag once", async () => {
      let resolved = 0;
      const instance = createRouter([
        { name: "contacts", path: "/contacts" },
        { name: "cars", path: "/cars" },
        {
          name: "vehicles",
          path: "/vehicles",
          forwardTo: () => {
            resolved++;

            return "cars";
          },
        },
      ]);

      router = instance;
      await instance.start("/contacts");

      const source = createActiveRouteSource(
        instance,
        "vehicles",
        undefined,
        undefined,
        { strict: true },
      );

      disconnect(source);
      await instance.navigate("cars");

      const beforeRead = resolved;

      expect(source.getSnapshot()).toBe(true);

      const afterFirstRead = resolved;

      source.getSnapshot();
      source.getSnapshot();
      source.subscribe(() => {});

      expect(afterFirstRead).toBeGreaterThan(beforeRead);
      expect(resolved).toBe(afterFirstRead);
    });

    // A destroyed source keeps the snapshot it held (INVARIANTS createRouteSource
    // Destroy #3) — it no longer answers for the router.
    it("createRouteSource: a destroyed source reads its last snapshot", async () => {
      const instance = await started("/contacts");
      const source = createRouteSource(instance);

      source.destroy();
      await instance.navigate("cars");

      expect(source.getSnapshot().route?.name).toBe("contacts");
    });

    // A connected source answers from what the router announced. A read made
    // by an earlier router listener during that announcement must not take the
    // change for itself, or the source's own listener finds nothing to tell.
    it("a read during the router's announcement does not swallow the source's own notification", async () => {
      const instance = await started("/contacts");
      const node = createRouteNodeSource(instance, "");
      const route = createRouteSource(instance);
      const active = createActiveRouteSource(instance, "cars");

      instance.subscribe(() => {
        node.getSnapshot();
        route.getSnapshot();
        active.getSnapshot();
      });

      const calls = [0, 0, 0];

      node.subscribe(() => calls[0]++);
      route.subscribe(() => calls[1]++);
      active.subscribe(() => calls[2]++);

      await instance.navigate("cars");

      expect(calls).toStrictEqual([1, 1, 1]);
    });
  });
});
