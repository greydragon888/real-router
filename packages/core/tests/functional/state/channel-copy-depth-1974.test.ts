// #1974 — the channel copy is ONE LEVEL, and this file is the pin for that
// limit rather than a fix for it.
//
// `normalizeChannel` copies the caller's bag key by key and `materialize` /
// `mergeQueryChannel` freeze the result, so the BAG is core's own object. A
// non-scalar VALUE inside it is not: it is whoever supplied the bag still
// holding it, unfrozen, and a later mutation makes the committed state
// contradict its own `state.path`.
//
// ⚑ Recorded, not closed, and the model is #1958's — *"core copies exactly one
// level on the way out"*. Deepening the copy would run on every navigation, on
// both channels, against a hazard core owns the object for in ONE arc out of
// four (see the table below); and the mutation lands after core is done, with no
// navigation in flight, so there is no moment at which core or a validator could
// report it either.
//
// ⚑ That last half is MEASURED, not reasoned: with `@real-router/validation-plugin`
// installed, mutating the caller's array after the commit produces ZERO reports —
// before the mutation and after it — while `state.path` stays `/a/2?tag=x&tag=y`
// and `state.search.tag` becomes `["x","y","LATE"]`. Deliberately not pinned as
// an assertion: "nobody reports this" is the current state, not a guarantee
// worth defending against someone who later finds a moment to report it in.
//
// ⚠ The issue was filed as "an array-valued QUERY param". The research that
// preceded this pin found the statement narrow on both axes — any object value,
// on BOTH channels — so the file measures the shape rather than the example. A
// future reader asking "is this still one level?" gets the whole answer here.
import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type {
  Params,
  SearchParams,
  SimpleState,
} from "@real-router/core/types";

describe("#1974 — the channel copy is one level", () => {
  it("the caller's own value survives into state.search, by reference and unfrozen", async () => {
    const router = createRouter([{ name: "a", path: "/a/:id?tag" }]);

    await router.start("/a/1");

    const callerArray = ["x", "y"];

    await router.navigate("a", { id: "2" }, {
      tag: callerArray,
    } as unknown as SearchParams);

    const committed = router.getState();
    const tag = (committed?.search as Record<string, unknown>).tag;

    // The bag is core's, the value is the caller's.
    expect(Object.isFrozen(committed?.search)).toBe(true);
    expect(tag).toBe(callerArray);
    expect(Object.isFrozen(tag)).toBe(false);

    // And that is observable: the state stops matching its own path.
    const pathAtCommit = committed?.path;

    callerArray.push("LATE");

    expect(pathAtCommit).toBe("/a/2?tag=x&tag=y");
    expect(
      (router.getState()?.search as Record<string, unknown>).tag,
    ).toStrictEqual(["x", "y", "LATE"]);
  });

  it("the PATH channel is not different, and the value need not be an array", async () => {
    // Two axes the issue's title got narrow, measured together: `params` rather
    // than `search`, and a plain object rather than an array.
    const router = createRouter([{ name: "a", path: "/a/:id" }]);

    await router.start("/a/1");

    const callerObject = { nested: 1 };

    await router.navigate("a", {
      id: "2",
      extra: callerObject,
    } as unknown as Params);

    const params = router.getState()?.params as Record<string, unknown>;

    expect(params.extra).toBe(callerObject);
    expect(Object.isFrozen(params.extra)).toBe(false);
  });

  it("a ROUTE's own defaultSearch literal is exposed the same way", async () => {
    // The second supplier: not the caller at all, but the route author's
    // literal, held by the store for the life of the router.
    const routeLiteral = ["d1", "d2"];
    const router = createRouter([
      {
        name: "a",
        path: "/a/:id?tag",
        defaultSearch: { tag: routeLiteral },
      },
    ]);

    await router.start("/a/1");

    expect((router.getState()?.search as Record<string, unknown>).tag).toBe(
      routeLiteral,
    );
  });

  it("a forwardState interceptor's bag is the third supplier", async () => {
    const router = createRouter([{ name: "a", path: "/a/:id?tag" }]);
    const pluginArray = ["p1"];

    getPluginApi(router).addInterceptor(
      "forwardState",
      (
        next: (n: string, p: Params, s?: SearchParams) => SimpleState,
        name: string,
        params: Params,
        search?: SearchParams,
      ) => ({
        ...next(name, params, search),
        search: { tag: pluginArray },
      }),
    );

    await router.start("/a/1");
    await router.navigate("a", { id: "3" });

    expect((router.getState()?.search as Record<string, unknown>).tag).toBe(
      pluginArray,
    );
  });

  it("CONTROL — on the URL arc the value is core's own, so nothing outside holds it", async () => {
    // The one supplier that is not exposed, and the reason deepening the copy
    // would be paying on four arcs for a hazard that exists on three: the parser
    // builds the array itself, per call.
    const router = createRouter([{ name: "a", path: "/a/:id?tag" }]);

    await router.start("/a/1?tag=x&tag=y");

    const fromStart = (router.getState()?.search as Record<string, unknown>)
      .tag;
    const fromMatch = (
      getPluginApi(router).matchPath("/a/1?tag=x&tag=y")?.search as Record<
        string,
        unknown
      >
    ).tag;

    expect(Array.isArray(fromStart)).toBe(true);
    expect(fromStart).not.toBe(fromMatch);
  });
});
