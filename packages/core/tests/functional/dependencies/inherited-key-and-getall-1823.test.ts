import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";

/**
 * Two faces of the same copy loop (#1823). Its third face — an inherited GETTER
 * walking past the no-getters guard — is #1799's and is pinned in its own file.
 *
 * (a) `for (const key in deps)` with no `Object.hasOwn` filter, on both doors,
 *     so an inherited name becomes a genuine dependency.
 * (b) `getAll()` spreads a store built with `Object.create(null)`, where an own
 *     `"__proto__"` is an ordinary key — the spread re-defines it on a normal
 *     object, so the RESULT is a prototype-swap primitive for any consumer that
 *     merges it with `Object.assign` or a `for…in` copy.
 */
describe("dependencies: the copy loop and getAll (#1823)", () => {
  it("does not adopt an inherited key, through either door", () => {
    const proto = { leaked: "LEAK" };

    // door 1 — the constructor's initial deps
    const viaCtor = createRouter(
      [{ name: "a", path: "/a" }],
      {},
      Object.assign(Object.create(proto), { real: 1 }) as never,
    );

    expect(getDependenciesApi(viaCtor).get("real" as never)).toBe(1); // CONTROL
    expect(getDependenciesApi(viaCtor).get("leaked" as never)).toBeUndefined();

    viaCtor.dispose();

    // door 2 — setAll
    const viaSetAll = createRouter([{ name: "a", path: "/a" }]);
    const api = getDependenciesApi(viaSetAll);

    api.setAll(Object.assign(Object.create(proto), { real: 2 }) as never);

    expect(api.get("real" as never)).toBe(2); // CONTROL
    expect(api.get("leaked" as never)).toBeUndefined();

    viaSetAll.dispose();
  });

  it("does not throw when a dependency name is an inherited accessor", () => {
    // ⚑ #1852's axis, and a regression this fix introduced before it fixed it:
    // the first draft built the result with `all[key] = value`, so an ordinary
    // dependency name that `Object.prototype` carries as a getter-only accessor
    // made a published, total API throw. A spread DEFINES and cannot.
    const router = createRouter([{ name: "a", path: "/a" }]);
    const api = getDependenciesApi(router);

    api.setAll({ store: 1, other: 2 });

    expect(Object.keys(api.getAll())).toStrictEqual(["store", "other"]); // CONTROL

    Object.defineProperty(Object.prototype, "store", {
      get: () => "G",
      configurable: true,
    });

    try {
      expect(Object.keys(api.getAll())).toStrictEqual(["store", "other"]);
    } finally {
      delete (Object.prototype as Record<string, unknown>).store;
    }

    router.dispose();
  });

  it("hands out a getAll() result that cannot swap a merger's prototype", () => {
    const router = createRouter([{ name: "a", path: "/a" }]);
    const api = getDependenciesApi(router);

    api.setAll(
      JSON.parse('{"__proto__":{"pwned":true},"keep":"yes"}') as never,
    );

    const all = api.getAll() as Record<string, unknown>;

    expect(all.keep).toBe("yes"); // CONTROL — ordinary keys survive

    // ⚠ Two assertions, and which one discriminates depends on HOW the result
    // is built — keep both, because the implementation has already moved once.
    // Against a spread + `delete` (today), dropping the delete leaves
    // `"__proto__"` as an ORDINARY own key on `all`, so this first pair stays
    // green and the `Object.assign` half below is what reds. Against a
    // write-loop draft, `all["__proto__"] = value` dispatched into the inherited
    // setter and swapped `all`'s own prototype, so this pair was the one that
    // caught it while a merge-target-only cell passed on the defect.
    expect(Object.getPrototypeOf(all)).toBe(Object.prototype);
    expect((all as { pwned?: unknown }).pwned).toBeUndefined();

    // ⚠ `Object.assign`, NOT a spread, and it must stay that way: assign uses
    // [[Set]] — the mechanism under test — while a spread DEFINES and cannot
    // reproduce it. `eslint --fix` rewrote this line to `{ ...all }` once and
    // silently removed the whole point of the cell.
    const merged: Record<string, unknown> = {};

    // eslint-disable-next-line unicorn/no-immediate-mutation -- see above: [[Set]] is the subject under test, a spread DEFINES and cannot reproduce it
    Object.assign(merged, all);

    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect((merged as { pwned?: unknown }).pwned).toBeUndefined();

    router.dispose();
  });
});
