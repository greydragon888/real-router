import { describe, expect, it, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Params } from "@real-router/core/types";

/**
 * The check channel (#2388) — a registration at a NAMED POSITION that may throw
 * and can do nothing else.
 *
 * ⚑ **Why a channel rather than a wider `addInterceptor`.** An interceptor
 * receives `next` and may call it with other arguments or not at all, and a
 * check may only throw. The two rights are disjoint in practice as well as in
 * principle — `CheckPositionMap`'s docblock in `types/api.ts` owns that
 * measurement and names what it walked.
 *
 * ⚠ These cells pin the MECHANISM on a router with no plugin installed. The
 * shipped consumer — `@real-router/validation-plugin` registering the path-bag
 * value walk here — is pinned in that package, which is the only side that can
 * import both.
 */
describe("the check channel (#2388)", () => {
  const routes = [{ name: "items", path: "/items/:id" }];

  it("a check sees core's own copy, not the caller's bag", () => {
    // ⚑ The position an interceptor cannot express: at the call boundary this
    // object does not exist yet. It is the one core prints the path from
    // (#2134), so a key that answers differently per read is judged on the value
    // that ships rather than on the one the caller still holds.
    const router = createRouter(routes);
    const callerBag: Params = { id: "7" };
    let adopted: unknown;

    getPluginApi(router).addCheck("buildPath:params", (ownParams) => {
      adopted = ownParams;
    });

    router.buildPath("items", callerBag);

    expect(adopted).toStrictEqual({ id: "7" });
    expect(adopted).not.toBe(callerBag);
  });

  it("the position reports absence, because the copy preserves it", () => {
    const router = createRouter([{ name: "home", path: "/home" }]);
    const seen: unknown[] = [];

    getPluginApi(router).addCheck("buildPath:params", (ownParams) => {
      seen.push(ownParams);
    });

    router.buildPath("home");

    expect(seen).toStrictEqual([undefined]);
  });

  it("a throwing check refuses the call, and the error reaches the caller as it was thrown", () => {
    const router = createRouter(routes);
    const refusal = new TypeError("no");

    getPluginApi(router).addCheck("buildPath:params", () => {
      throw refusal;
    });

    expect(() => router.buildPath("items", { id: "7" })).toThrow(refusal);
  });

  it("checks run in registration order, and the FIRST throw wins", () => {
    // ⚠ Core does not collect refusals: the caller gets one error, and a second
    // check's opinion about a value already refused is not actionable.
    const router = createRouter(routes);
    const order: string[] = [];
    const api = getPluginApi(router);

    api.addCheck("buildPath:params", () => {
      order.push("first");
    });
    api.addCheck("buildPath:params", () => {
      order.push("second");

      throw new TypeError("stop");
    });
    api.addCheck("buildPath:params", () => {
      order.push("third");
    });

    expect(() => router.buildPath("items", { id: "7" })).toThrow("stop");
    expect(order).toStrictEqual(["first", "second"]);
  });

  it("unsubscribe removes exactly one registration, and twice removes no more", () => {
    const router = createRouter(routes);
    const api = getPluginApi(router);
    const mine = vi.fn();
    const theirs = vi.fn();

    const remove = api.addCheck("buildPath:params", mine);

    api.addCheck("buildPath:params", theirs);

    remove();
    remove();

    router.buildPath("items", { id: "7" });

    expect(mine).not.toHaveBeenCalled();
    expect(theirs).toHaveBeenCalledTimes(1);
  });

  it("the door refuses a position no call site reads, and names the WHOLE set", () => {
    // ⚠ `toBe` on the message, not `toThrow(string)`: the latter matches a
    // SUBSTRING, so a cell written that way keeps passing when a position is
    // added — it pins a prefix while claiming to pin the set.
    const router = createRouter(routes);

    expect(() =>
      // @ts-expect-error -- the refusal exists for the JS caller the type stops
      getPluginApi(router).addCheck("buildPath:entry", () => undefined),
    ).toThrow(
      new TypeError(
        '[router.addCheck] Invalid position: "buildPath:entry". Must be one of: buildPath:params, buildPathResolved:params',
      ),
    );
  });

  it("a NON-STRING position is rendered by type, so the caller's toString never runs", () => {
    // ⚠ The half that would coerce: quoting `${position}` here would invoke a
    // hostile `toString` inside the refusal. `hasOwn` is asked first and would
    // perform `ToPropertyKey` on the same value, so the string test guards both.
    const router = createRouter(routes);
    const hostile = {
      toString() {
        throw new Error("toString must not run");
      },
    };

    expect(() =>
      // @ts-expect-error -- the refusal exists for the JS caller the type stops
      getPluginApi(router).addCheck(hostile, () => undefined),
    ).toThrow(
      new TypeError(
        "[router.addCheck] Invalid position: object. Must be one of: buildPath:params, buildPathResolved:params",
      ),
    );
  });

  it("the door refuses a non-function, and renders it by TYPE", () => {
    // ⚠ Neither half runs the caller's `toString`: the message prints the type,
    // and membership is asked with `hasOwn`. Same wording as `addInterceptor`.
    const router = createRouter(routes);

    expect(() =>
      // @ts-expect-error -- same, for the JS caller
      getPluginApi(router).addCheck("buildPath:params", 42),
    ).toThrow("[router.addCheck] check must be a function, got number");
  });

  it("a check registered DURING a call is not seen by the call in flight", () => {
    // ⚑ Re-entrancy is expected rather than guarded: a plugin's own registration
    // pass reaches core doors — `@real-router/validation-plugin` walks the route
    // table through `getRoutesApi` while installing — so the channel must have a
    // defined answer for "registered while running". It reads the length it held
    // when the position was entered.
    const router = createRouter(routes);
    const api = getPluginApi(router);
    const late = vi.fn();

    api.addCheck("buildPath:params", () => {
      api.addCheck("buildPath:params", late);
    });

    router.buildPath("items", { id: "7" });

    expect(late).not.toHaveBeenCalled();

    router.buildPath("items", { id: "8" });

    expect(late).toHaveBeenCalledTimes(1);
  });

  it("ANTI-VACUUM: the door builds normally with no check registered", () => {
    // Without this the cells above would agree with a channel that never runs.
    const router = createRouter(routes);

    expect(router.buildPath("items", { id: "7" })).toBe("/items/7");
  });
});
