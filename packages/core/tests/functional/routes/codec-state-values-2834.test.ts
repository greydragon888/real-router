import { describe, it, expect, expectTypeOf } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type {
  Params,
  ParamsSearch,
  Route,
  SearchParams,
  SearchParamValue,
} from "@real-router/core";

/**
 * #2834 — a route codec's STATE side is typed apart from its URL side.
 *
 * Types are erased, so what pins the fix in this file is `type-check:tests`,
 * not a cell: the routes below follow the wiki recipes, narrow a query value
 * with `as string`, cast nothing to fit a codec's return type, and every door
 * call passes a decoded value the way an application would.
 */

const toDay = (date: Date): string =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");

const fromDay = (day: string): Date => new Date(`${day}T00:00`);

// The wiki "Dates" recipe.
const events: Route = {
  name: "events",
  path: "/events?from&to",
  decodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      from: search.from ? fromDay(search.from as string) : undefined,
      to: search.to ? fromDay(search.to as string) : undefined,
    },
  }),
  encodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      from: search.from instanceof Date ? toDay(search.from) : search.from,
      to: search.to instanceof Date ? toDay(search.to) : search.to,
    },
  }),
};

// The same pair on a path slot.
const day: Route = {
  name: "day",
  path: "/day/:day",
  decodeParams: ({ params, search }) => ({
    params: { ...params, day: fromDay(params.day) },
    search,
  }),
  encodeParams: ({ params, search }) => ({
    params: {
      ...params,
      day: params.day instanceof Date ? toDay(params.day) : params.day,
    },
    search,
  }),
};

// The wiki JSON recipe, with the object it decodes typed.
const catalog: Route = {
  name: "catalog",
  path: "/catalog?filter",
  decodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      filter: search.filter
        ? (JSON.parse(search.filter as string) as { status: string })
        : undefined,
    },
  }),
  encodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      filter: search.filter ? JSON.stringify(search.filter) : undefined,
    },
  }),
};

const home: Route = { name: "home", path: "/" };

const MARCH_15 = new Date(2024, 2, 15);

describe("#2834 — a codec's decoded value is a state value", () => {
  it("a Date decoded into search is in state.search", () => {
    const router = createRouter([events]);
    const from = getPluginApi(router).matchPath("/events?from=2024-03-15")
      ?.search.from;

    expect(from instanceof Date && toDay(from)).toBe("2024-03-15");
  });

  it("a Date decoded into a path slot is in state.params", () => {
    const router = createRouter([day]);
    const value = getPluginApi(router).matchPath("/day/2024-03-15")?.params.day;

    expect(value instanceof Date && toDay(value)).toBe("2024-03-15");
  });

  it("an object decoded into search is in state.search", () => {
    const router = createRouter([catalog]);
    const state = getPluginApi(router).matchPath(
      `/catalog?filter=${encodeURIComponent('{"status":"active"}')}`,
    );

    expect(state?.search.filter).toStrictEqual({ status: "active" });
  });
});

describe("#2834 — the doors that take a state-side bag take a state value", () => {
  it("navigate, positional", async () => {
    const router = createRouter([home, events], { defaultRoute: "home" });

    await router.start("/");

    const state = await router.navigate("events", {}, { from: MARCH_15 });

    expect(state.path).toBe("/events?from=2024-03-15");
  });

  it("navigate, descriptor", async () => {
    const router = createRouter([home, day], { defaultRoute: "home" });

    await router.start("/");

    const state = await router.navigate({
      name: "day",
      params: { day: MARCH_15 },
    });

    expect(state.path).toBe("/day/2024-03-15");
  });

  it("buildPath", () => {
    const router = createRouter([catalog]);

    expect(
      router.buildPath("catalog", {}, { filter: { status: "draft" } }),
    ).toBe(`/catalog?filter=${encodeURIComponent('{"status":"draft"}')}`);
  });

  it("isActiveRoute", async () => {
    const router = createRouter([home, events], { defaultRoute: "home" });

    await router.start("/events?from=2024-03-15");

    expect(
      router.isActiveRoute(
        "events",
        {},
        { from: new Date(2024, 2, 15) },
        false,
        false,
      ),
    ).toBe(true);
  });

  it("canNavigateTo", () => {
    const router = createRouter([day]);

    expect(router.canNavigateTo("day", { day: MARCH_15 })).toBe(true);
  });

  it("makeState", () => {
    const router = createRouter([day]);

    expect(
      getPluginApi(router).makeState("day", { day: MARCH_15 }).params.day,
    ).toBe(MARCH_15);
  });

  it("buildNavigationState", () => {
    const router = createRouter([events]);

    expect(
      getPluginApi(router).buildNavigationState(
        "events",
        {},
        { from: MARCH_15 },
      )?.path,
    ).toBe("/events?from=2024-03-15");
  });

  it("forwardState", () => {
    const router = createRouter([events]);

    expect(
      getPluginApi(router).forwardState("events", {}, { from: MARCH_15 }).search
        .from,
    ).toBe(MARCH_15);
  });

  it("a route default", () => {
    const router = createRouter([
      { ...events, defaultSearch: { from: MARCH_15 } },
    ]);

    expect(router.buildPath("events")).toBe("/events?from=2024-03-15");
  });
});

describe("#2834 — the two sides of a codec", () => {
  type Decoder = NonNullable<Route["decodeParams"]>;
  type Encoder = NonNullable<Route["encodeParams"]>;

  it("decodeParams receives what the URL holds", () => {
    type UrlSide = Parameters<Decoder>[0];

    expectTypeOf<UrlSide["params"][string]>().toEqualTypeOf<string>();
    expectTypeOf<UrlSide["search"][string]>().toEqualTypeOf<
      SearchParamValue | undefined
    >();

    const seen: UrlSide[] = [];
    const router = createRouter([
      {
        ...day,
        decodeParams: (channels) => {
          seen.push(channels);

          return channels;
        },
      },
    ]);

    getPluginApi(router).matchPath("/day/2024-03-15");

    expect(seen.map(({ params }) => params)).toStrictEqual([
      { day: "2024-03-15" },
    ]);
  });

  it("decodeParams returns, and encodeParams receives, state values", () => {
    expectTypeOf<ReturnType<Decoder>>().toEqualTypeOf<ParamsSearch>();
    expectTypeOf<Parameters<Encoder>[0]>().toEqualTypeOf<ParamsSearch>();

    const seen: unknown[] = [];
    const router = createRouter([
      {
        ...day,
        encodeParams: (channels) => {
          seen.push(channels.params.day);

          return { params: { day: "2024-03-15" }, search: channels.search };
        },
      },
    ]);

    router.buildPath("day", { day: MARCH_15 });

    expect(seen).toStrictEqual([MARCH_15]);
  });

  // eslint-disable-next-line vitest/expect-expect -- `expectTypeOf<>()` asserts at compile time; the domain is a fact about the type, not about a call
  it("a state value is a JSON primitive, a Date, a plain object of them, or an array of those", () => {
    expectTypeOf<Date>().toExtend<SearchParams[string]>();
    expectTypeOf<Date>().toExtend<Params[string]>();
    expectTypeOf<(Date | number | null)[]>().toExtend<Params[string]>();
    expectTypeOf<{
      status: string;
      tags: (string | null)[];
      range: { from: Date };
    }>().toExtend<SearchParams[string]>();
    // What the parser produces fits, so a decoder's `...search` compiles.
    expectTypeOf<SearchParamValue>().toExtend<SearchParams[string]>();
  });

  // eslint-disable-next-line vitest/expect-expect -- `expectTypeOf<>()` asserts at compile time; the domain is a fact about the type, not about a call
  it("a function, a symbol, a bigint or another class instance is not", () => {
    expectTypeOf<() => void>().not.toExtend<Params[string]>();
    expectTypeOf<symbol>().not.toExtend<SearchParams[string]>();
    expectTypeOf<bigint>().not.toExtend<SearchParams[string]>();
    expectTypeOf<Map<string, string>>().not.toExtend<Params[string]>();
    // Nor inside an object or an array.
    expectTypeOf<{ cb: () => void }>().not.toExtend<Params[string]>();
    expectTypeOf<(() => void)[]>().not.toExtend<Params[string]>();
    expectTypeOf<{
      m: Map<string, string>;
    }>().not.toExtend<SearchParams[string]>();
  });

  // eslint-disable-next-line vitest/expect-expect -- `expectTypeOf<>()` asserts at compile time; the domain is a fact about the type, not about a call
  it("`undefined` is a value, but not an array element", () => {
    expectTypeOf<undefined>().toExtend<Params[string]>();
    expectTypeOf<undefined>().toExtend<SearchParams[string]>();
    expectTypeOf<(string | undefined)[]>().not.toExtend<Params[string]>();
    expectTypeOf<(string | undefined)[]>().not.toExtend<SearchParams[string]>();
  });
});
