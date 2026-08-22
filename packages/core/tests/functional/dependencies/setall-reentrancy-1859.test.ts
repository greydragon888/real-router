import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";

/**
 * #1859 — the write paths re-read `store.dependencies` on every access, and
 * `dispose()` / `reset()` clear this channel by REPLACING that property. So a
 * teardown triggered from inside the call found the fresh object and had the
 * remaining writes land in it. Every clear path is a write path and refuses on a
 * disposed router, so the caller's value was pinned with nothing able to release
 * it, while `getAll()` kept answering with the leak.
 *
 * ⚑ There are TWO user-code windows per key, not one, and that is why the fix is
 * a captured target rather than a disposal probe: reading `deps[key]` runs an
 * accessor if the caller supplied one, and `validateDependencyCount` /
 * `warnOverwrite` reach `logger.warn` → the application's `LoggerConfig.callback`.
 * A probe between them closes the first and leaves the second wide open — the
 * callback route reproduced the leak in full on a bag with no accessors at all.
 */
const ROUTES = [{ name: "a", path: "/a" }];

/**
 * ⚠ The VALIDATOR window — `validateDependencyCount` / `warnOverwrite` reaching
 * `logger.callback` — is exercised in `@real-router/validation-plugin`'s own
 * suite, not here. It needs the plugin installed, and reaching it from core
 * would mean injecting through `src/internals`, which functional tests are
 * forbidden from importing. See
 * `validation-plugin/tests/functional/dependencies-reentrancy-1859.test.ts`.
 */
const attempt = (fn: () => unknown): string => {
  try {
    fn();

    return "ok";
  } catch (error) {
    return (error as Error).message;
  }
};

describe("a teardown from inside the call cannot land a write (#1859)", () => {
  it("setAll: the GETTER window writes nothing and pins nothing", () => {
    const router = createRouter(ROUTES, {}, { boot: "B" } as never);
    const api = getDependenciesApi(router);
    const retained = { big: "PAYLOAD" };

    expect(
      attempt(() => {
        api.setAll({
          a: 1,
          get b() {
            router.dispose();

            return retained;
          },
          c: 3,
        } as never);
      }),
    ).toBe("DISPOSED");

    expect(Object.keys(api.getAll())).toStrictEqual([]);
    expect(Object.values(api.getAll())).not.toContain(retained);
  });

  it("reset() mid-call leaves a coherent store, not a straddled one", () => {
    // ⚠ `reset()` replaces the same slot `dispose()` does, so it is the second
    // path this class covers. It is not an error — the router is still alive —
    // so the call succeeds; what matters is that one `setAll` cannot end up
    // spanning two store objects.
    const router = createRouter(ROUTES, {}, { boot: "B" } as never);
    const api = getDependenciesApi(router);

    expect(
      attempt(() => {
        api.setAll({
          a: 1,
          get b() {
            api.reset();

            return 2;
          },
          c: 3,
        } as never);
      }),
    ).toBe("ok");

    expect(Object.keys(api.getAll())).toStrictEqual([]);

    router.dispose();
  });

  it("CONTROL — an accessor that does NOT tear down is copied normally", () => {
    const router = createRouter(ROUTES);
    const api = getDependenciesApi(router);

    api.setAll({
      a: 1,
      get b() {
        return "B";
      },
      c: 3,
    });

    expect(Object.keys(api.getAll())).toStrictEqual(["a", "b", "c"]);
    expect(api.get("b" as never)).toBe("B");

    router.dispose();
  });
});
