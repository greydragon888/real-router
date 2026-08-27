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
  /**
   * ⚑ **One of the two windows is GONE, closed at its source rather than
   * survived (#1860).** `setAll` reached no structural check at all, which is the
   * only reason a bag carrying an own enumerable getter could ever reach the copy
   * loop; it now goes through `ingestDependencies`, the door the constructor has
   * always used, and an accessor is refused there. So the cells below assert that
   * the getter never RUNS, where they used to assert that a teardown from inside
   * it could not land a write.
   *
   * ⚠ The class is not closed, and the fix that closed this window is not the fix
   * for it. The VALIDATOR window — `validateDependencyCount` / `warnOverwrite`
   * reaching `logger.callback` — needs no accessor at all and is still live; the
   * captured target is what holds it, and it is exercised in
   * `validation-plugin/tests/functional/dependencies-reentrancy-1859.test.ts`
   * (green, measured, at the time this narrowed).
   */
  it("setAll: the accessor window is refused, so nothing can tear down inside it", () => {
    const router = createRouter(ROUTES, {}, { boot: "B" } as never);
    const api = getDependenciesApi(router);
    let invoked = 0;

    expect(
      attempt(() => {
        api.setAll({
          a: 1,
          get b() {
            invoked += 1;
            router.dispose();

            return "PAYLOAD";
          },
          c: 3,
        } as never);
      }),
      "the refusal comes from the DOOR, not from a disposal mid-copy",
    ).toBe('dependencies cannot contain getters: "b"');

    expect(invoked, "the whole point: the caller's code does not run").toBe(0);
    expect(
      Object.keys(api.getAll()),
      "and the store is exactly as it was — no key from before the getter either",
    ).toStrictEqual(["boot"]);

    router.dispose();
  });

  it("reset() mid-call cannot straddle two stores, for the same reason", () => {
    // ⚠ `reset()` replaces the same slot `dispose()` does, so it was the second
    // path this class covered. It needed an accessor to reach, and there is no
    // longer a way to put one in.
    const router = createRouter(ROUTES, {}, { boot: "B" } as never);
    const api = getDependenciesApi(router);
    let invoked = 0;

    expect(
      attempt(() => {
        api.setAll({
          a: 1,
          get b() {
            invoked += 1;
            api.reset();

            return 2;
          },
          c: 3,
        } as never);
      }),
    ).toBe('dependencies cannot contain getters: "b"');

    expect(invoked).toBe(0);
    expect(Object.keys(api.getAll())).toStrictEqual(["boot"]);

    router.dispose();
  });

  it("CONTROL — the ban is on the SHAPE, so a harmless accessor is refused too", () => {
    // The previous control asserted the opposite — that an accessor which does
    // not tear down is copied normally. That was true while `setAll` had no
    // structural check; keeping it would now pin the hole rather than the rule.
    const router = createRouter(ROUTES);
    const api = getDependenciesApi(router);

    expect(() => {
      api.setAll({
        a: 1,
        get b() {
          return "B";
        },
        c: 3,
      });
    }).toThrow('dependencies cannot contain getters: "b"');

    expect(
      Object.keys(api.getAll()),
      "refusal is atomic — `a` was not installed before `b` was judged",
    ).toStrictEqual([]);

    router.dispose();
  });

  it("CONTROL — a plain bag still goes in, so the door is not refusing everything", () => {
    const router = createRouter(ROUTES);
    const api = getDependenciesApi(router);

    api.setAll({ a: 1, b: "B", c: 3 });

    expect(Object.keys(api.getAll())).toStrictEqual(["a", "b", "c"]);

    router.dispose();
  });
});
