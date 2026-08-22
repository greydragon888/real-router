import { createRouter } from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "../../src";

/**
 * #1859, the half that only this package can reach.
 *
 * Core's write paths have TWO user-code windows per key. The first is reading
 * `deps[key]`, which runs a caller's accessor — pinned in core's own suite. The
 * second is THIS one: `validateDependencyCount` and `warnOverwrite` call
 * `logger.warn`, and `logger.callback` is public `RouterOptions` API, invoked
 * synchronously between the read and the write.
 *
 * It matters because it needs no accessor at all — a plain data bag reaches it.
 * A disposal probe placed between the read and the write closes the first window
 * and leaves this one open; core's fix is a captured write target, which closes
 * both. These cells are what tell those two designs apart.
 *
 * ⚑ Everything here goes through the public surface. Core cannot host it: it
 * does not depend on this plugin, and functional tests may not import
 * `src/internals` to fake a validator.
 */
const ROUTES = [{ name: "a", path: "/a" }];

/** `computeThresholds` warns at `floor(limit * 0.2)`, so 5 warns from 1 key up. */
const LIMITS = { maxDependencies: 5 };

const attempt = (fn: () => unknown): string => {
  try {
    fn();

    return "ok";
  } catch (error) {
    return (error as Error).message;
  }
};

const routerThatDisposesFromItsLogger = () => {
  // A holder rather than a forward-declared binding: the callback has to reach a
  // router that does not exist yet when the options object is built.
  const holder: { dispose?: () => void } = {};

  let disposed = false;

  const router = createRouter<Record<string, unknown>>(
    ROUTES,
    {
      limits: LIMITS,
      logger: {
        level: "all",
        callback: () => {
          if (!disposed) {
            disposed = true;
            holder.dispose?.();
          }
        },
      },
    },
    { boot: "B" },
  );

  holder.dispose = () => {
    router.dispose();
  };
  router.usePlugin(validationPlugin());

  return router;
};

describe("a logger callback that disposes mid-write lands nothing (#1859)", () => {
  it("setAll: a bag with NO accessor still cannot leak through the callback", () => {
    const router = routerThatDisposesFromItsLogger();
    const api = getDependenciesApi(router);
    const retained = { big: "PAYLOAD" };

    expect(
      attempt(() => {
        api.setAll({ leak: retained, second: 2 });
      }),
    ).toBe("DISPOSED");

    expect(Object.values(api.getAll())).not.toContain(retained);
    expect(Object.keys(api.getAll())).toStrictEqual([]);
  });

  it("set: the single-key door, which used to report success while leaking", () => {
    const router = routerThatDisposesFromItsLogger();
    const api = getDependenciesApi(router);
    const retained = { big: "PAYLOAD" };

    // An overwrite of the seeded `boot`, so `warnOverwrite` reaches the callback.
    expect(
      attempt(() => {
        api.set("boot" as never, retained);
      }),
    ).toBe("DISPOSED");

    expect(Object.values(api.getAll())).not.toContain(retained);
    expect(Object.keys(api.getAll())).toStrictEqual([]);
  });

  it("CONTROL — the same calls on a logger that does not dispose", () => {
    const seen: string[] = [];
    const router = createRouter<Record<string, unknown>>(
      ROUTES,
      {
        limits: LIMITS,
        logger: { level: "all", callback: () => seen.push("warned") },
      },
      { boot: "B" },
    );

    router.usePlugin(validationPlugin());

    const api = getDependenciesApi(router);

    expect(
      attempt(() => {
        api.setAll({ x: 1 });
      }),
    ).toBe("ok");
    expect(
      attempt(() => {
        api.set("boot" as never, "NEW");
      }),
    ).toBe("ok");
    expect(Object.keys(api.getAll())).toStrictEqual(["boot", "x"]);
    expect(api.get("boot" as never)).toBe("NEW");
    // The callback really did fire — otherwise the two cells above would be
    // green for want of a window rather than because the window is closed.
    expect(seen.length).toBeGreaterThan(0);

    router.dispose();
  });
});
