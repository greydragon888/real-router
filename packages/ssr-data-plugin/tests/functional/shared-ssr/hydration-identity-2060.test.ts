import { createRouter } from "@real-router/core";
import { hydrateRouter, serializeRouterState } from "@real-router/ssr-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ssrDataPluginFactory } from "../../../src";

import type { Route, Router, SearchParams } from "@real-router/core";
import type { ParamsSearch } from "@real-router/core/types";

/**
 * #2060 — the post-hydration scratchpad skip must be keyed by the STATE the
 * payload was built for, not by its route name alone.
 *
 * `hydrateRouter` starts the router at `parsed.path`, so the committed state is
 * derived from that one field. A payload whose `params` / `search` disagree
 * with its own `path` therefore describes a different state than the one being
 * committed — and was served for it anyway, with the loader skipped.
 *
 * ⚠ What this does NOT close, and cannot: a payload whose envelope is
 * self-consistent while its `context` was built for another state. The
 * disagreement is then entirely in opaque data. That residual is a contract,
 * stated in this package's CLAUDE.md.
 *
 * ⚑ The payloads are ROUND-TRIPPED through `serializeRouterState`, not
 * hand-written, and a row that tweaks one changes one field of a real one. A
 * payload holds what the wire gives back, and a hand-written one only guesses
 * at it: a codec's `Date` comes back from JSON as its ISO string, so a
 * hand-written payload holding the `Date` agrees where the real one does not.
 */

/**
 * A codec over one query key that keeps an object in the state and its text in
 * the URL — the shape #2918 hydrates. `print` and `read` are an exact inverse
 * pair; any other value passes through.
 */
function objectQueryCodec<T extends object>(
  key: string,
  print: (value: T) => string,
  read: (text: string) => T,
): Pick<Route, "encodeParams" | "decodeParams"> {
  const withValue = (search: SearchParams, value: unknown): SearchParams =>
    ({ ...search, [key]: value }) as SearchParams;

  return {
    encodeParams: ({ params, search }: ParamsSearch): ParamsSearch => {
      const value: unknown = search[key];

      return {
        params,
        search: withValue(
          search,
          typeof value === "object" && value !== null
            ? print(value as T)
            : value,
        ),
      };
    },
    decodeParams: ({ params, search }: ParamsSearch): ParamsSearch => {
      const value = search[key];

      return {
        params,
        search: withValue(
          search,
          typeof value === "string" ? read(value) : value,
        ),
      };
    },
  };
}

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/" },
      { name: "profile", path: "/:id?tab&tag" },
    ],
  },
  {
    name: "filtered",
    path: "/filtered?filter",
    ...objectQueryCodec<object>(
      "filter",
      (filter) => JSON.stringify(filter),
      (text) => JSON.parse(text) as object,
    ),
  },
  {
    // A UTC day, so the URL is the same in every time zone the suite runs in.
    name: "events",
    path: "/events?from",
    ...objectQueryCodec<Date>(
      "from",
      (day) => day.toISOString().slice(0, 10),
      (text) => new Date(text),
    ),
  },
  {
    name: "tagged",
    path: "/tagged?tags",
    ...objectQueryCodec<Set<string>>(
      "tags",
      (tags) => [...tags].join(","),
      (text) => new Set(text.split(",")),
    ),
  },
];

/** A URL whose `filter` is the JSON text the `filtered` route's codec prints. */
const FILTER_PATH = `/filtered?filter=${encodeURIComponent(
  JSON.stringify({ status: "active" }),
)}`;

const DAY_PATH = "/events?from=2024-03-15";

type Payload = Record<string, unknown>;

/** The serializer pair a payload crosses the wire with. */
interface Wire {
  readonly serialize: (value: unknown) => string;
  readonly deserialize: (text: string) => unknown;
}

/** What `serializeRouterState` and `hydrateRouter` use when given no pair. */
const JSON_WIRE: Wire = {
  serialize: (value) => JSON.stringify(value),
  deserialize: (text) => JSON.parse(text) as unknown,
};

/** The exact shape of `toISOString()`, the string JSON makes of a `Date`. */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

/** The tag the reviving pair writes a `Set` as. */
const isSetTag = (value: unknown): value is { $set: unknown[] } =>
  typeof value === "object" &&
  value !== null &&
  Object.hasOwn(value, "$set") &&
  Array.isArray((value as { $set: unknown }).$set);

const reviveDate = (item: unknown): unknown =>
  typeof item === "string" && ISO_TIMESTAMP.test(item) ? new Date(item) : item;

const reviveSet = (item: unknown): unknown =>
  isSetTag(item) ? new Set(item.$set) : item;

/**
 * A pair that gives a `Date` and a `Set` back in their own types, in the place
 * devalue's would stand. JSON writes a `Date` as its ISO string, which the
 * reviver reads back from every string of exactly that shape; a `Set` it tags.
 */
const REVIVING_WIRE: Wire = {
  serialize: (value) =>
    JSON.stringify(value, (_key, item: unknown) =>
      item instanceof Set ? { $set: [...item] } : item,
    ),
  deserialize: (text) =>
    JSON.parse(text, (_key, item: unknown) =>
      reviveSet(reviveDate(item)),
    ) as unknown,
};

/** Renders `path` on a "server" and returns the payload it would ship. */
async function serverPayload(
  path: string,
  data: unknown,
  wire: Wire = JSON_WIRE,
): Promise<Payload> {
  const server = createRouter(routes, { defaultRoute: "home" });

  await server.start(path);

  const parsed = wire.deserialize(
    serializeRouterState(server.getState()!, { serialize: wire.serialize }),
  ) as Payload;

  server.stop();

  return {
    ...parsed,
    context: { ...(parsed.context as Payload), data },
  };
}

/**
 * Each row hands the client a payload that does NOT describe the state the
 * `path` commits. Every one must fall through to the loader.
 */
const MISMATCHES: {
  readonly name: string;
  /** Route whose loader must run; defaults to the param-bearing one. */
  readonly route?: string;
  readonly build: () => Promise<Payload>;
}[] = [
  {
    name: "params name another id",
    build: async () => ({
      ...(await serverPayload("/users/42", "STALE")),
      path: "/users/7",
    }),
  },
  {
    name: "a search value differs",
    build: async () => ({
      ...(await serverPayload("/users/42?tab=1", "STALE")),
      path: "/users/42?tab=9",
    }),
  },
  {
    name: "an array element differs",
    build: async () => ({
      ...(await serverPayload("/users/42?tag=a&tag=b", "STALE")),
      path: "/users/42?tag=a&tag=c",
    }),
  },
  {
    name: "an array is shorter",
    build: async () => ({
      ...(await serverPayload("/users/42?tag=a", "STALE")),
      path: "/users/42?tag=a&tag=b",
    }),
  },
  {
    name: "the payload carries a key the state has not",
    build: async () => ({
      ...(await serverPayload("/users/42?tab=1&tag=a", "STALE")),
      path: "/users/42?tab=1",
    }),
  },
  {
    name: "a key is spelled differently",
    build: async () => {
      const payload = await serverPayload("/users/42?tab=1", "STALE");

      return { ...payload, search: { tag: 1 } };
    },
  },
  {
    name: "a channel is a primitive",
    build: async () => ({
      ...(await serverPayload("/users/42", "STALE")),
      params: "id=42",
    }),
  },
  {
    name: "a channel is an array",
    build: async () => ({
      ...(await serverPayload("/users/42", "STALE")),
      params: [],
    }),
  },
  {
    name: "a channel is null while the route declares one",
    build: async () => ({
      ...(await serverPayload("/users/42", "STALE")),
      params: null,
    }),
  },
  {
    // ⚑ The row that pins the `Array.isArray` term, and the only one that
    // does. Every other array row is caught first by the key-count check;
    // measured — removing the term left all of them green. Here the committed
    // bag is empty and `Object.keys([])` is empty too, so without the term an
    // empty array would AGREE with a route that declares nothing.
    name: "an empty array stands in for a route that declares no channel",
    route: "users.list",
    build: async () => ({
      ...(await serverPayload("/users/", "STALE")),
      params: [],
    }),
  },
  {
    // ⚑ A bare value agrees with an array only when the array holds one
    // element. A string is index-addressable and has a `length`, so a
    // comparison that walks the committed `["a", "b"]` by index lets `"ab"`
    // agree with it.
    name: "a string impersonates the repeated-key array it indexes like",
    build: async () => ({
      ...(await serverPayload("/users/42?tag=a&tag=b", "STALE")),
      search: { tag: "ab" },
    }),
  },
  {
    // ⚑ Pins the length equality: a walk bounded by the committed side's
    // length alone stops at the prefix a LONGER payload shares with it.
    name: "an array is longer than the one the state committed",
    build: async () => ({
      ...(await serverPayload("/users/42?tag=a&tag=b", "STALE")),
      search: { tag: ["a", "b", "c"] },
    }),
  },
  {
    // ⚑ No field is tweaked: the wire changes the value's type. JSON writes
    // the codec's `Date` as its ISO string, and an object never equals a
    // scalar. Pins that the values are not compared by their JSON text, which
    // is the same for the `Date` and for its string.
    name: "a Date a codec decodes comes back from JSON as its string",
    route: "events",
    build: () => serverPayload(DAY_PATH, "STALE"),
  },
  {
    // ⚑ The pair gives the `Set` back as a `Set`, and it still disagrees: core
    // has no key for it and compares it by identity, while the client decodes
    // its own. Its JSON text is `{}` on both sides.
    name: "a Set a codec decodes has no key, even revived by its pair",
    route: "tagged",
    build: () => serverPayload("/tagged?tags=a,b", "STALE", REVIVING_WIRE),
  },
  {
    // ⚑ #2064's class, reached through the payload. `channelAgrees` counts the
    // payload channel with `objectKeys` — own AND enumerable — and decides
    // membership from that same list. A membership test that asks the bag
    // instead, such as `hasOwn`, is own ONLY: a channel whose visible surface
    // is disjoint from the committed one, with the matching key CONCEALED
    // behind `enumerable: false`, satisfies both — the counts agree at one and
    // that test vouches for a key the count refused to see.
    name: "a channel conceals its matching key behind enumerable: false",
    build: async () => {
      const payload = await serverPayload("/users/42?tab=1", "STALE");
      const search: Record<string, unknown> = { other: "x" };

      // ⚠ The concealed value agrees with the committed `{ tab: 1 }`, so the
      // key is the only thing that can refuse this payload. With a value that
      // disagrees, the row passes whatever the membership test answers.
      Object.defineProperty(search, "tab", { value: 1, enumerable: false });

      return { ...payload, search };
    },
  },
  {
    // ⚑ Pins `typeof payloadChannel !== "object"`. Same shape as the empty
    // array above: `Object.keys("")` is empty, so a primitive whose key count
    // happens to match would otherwise agree.
    name: "an empty string stands in for a route that declares no channel",
    route: "users.list",
    build: async () => ({
      ...(await serverPayload("/users/", "STALE")),
      params: "",
    }),
  },
  {
    // ⚑ Pins the own-key half of `bagKeys.includes(key)` — the #1835 rule, on
    // this branch's own reader. The key COUNT matches, so nothing upstream
    // refuses it; only the membership test does, because `Object.keys` lists
    // no inherited key. Without it the inherited `id` answers for the
    // committed one.
    name: "the payload inherits the key it is missing",
    build: async () => {
      const payload = await serverPayload("/users/42", "STALE");

      return {
        ...payload,
        params: Object.create(
          { id: "42" },
          { other: { value: "x", enumerable: true } },
        ) as Record<string, unknown>,
      };
    },
  },
];

/**
 * Each row hands the client a payload that DOES describe the committed state,
 * with a value that is another form of the committed one rather than the same
 * object (#2918). The values compare by core's `areParamValuesEqual`, the rule
 * `areStatesEqual` uses, and every row must skip the loader.
 */
const AGREEMENTS: {
  readonly name: string;
  /** Route whose loader must be skipped; defaults to the param-bearing one. */
  readonly route?: string;
  readonly build: () => Promise<Payload>;
}[] = [
  {
    // `?tab=9` commits the number; both spellings print `?tab=9`.
    name: "a number the URL parses, shipped as its string",
    build: async () => {
      const payload = await serverPayload("/users/42?tab=9", "FROM-SERVER");

      return {
        ...payload,
        search: { ...(payload.search as Payload), tab: "9" },
      };
    },
  },
  {
    // A one-element array prints as its element does: `?tag=a`.
    name: "a lone value, shipped as a one-element array",
    build: async () => {
      const payload = await serverPayload("/users/42?tag=a", "FROM-SERVER");

      return {
        ...payload,
        search: { ...(payload.search as Payload), tag: ["a"] },
      };
    },
  },
  {
    // The codec decodes a fresh object on each side; a plain object compares
    // by its `JSON.stringify` key, which JSON gives back unchanged.
    name: "a JSON filter a codec decodes into a plain object",
    route: "filtered",
    build: () => serverPayload(FILTER_PATH, "FROM-SERVER"),
  },
  {
    // The pair gives the `Date` back as a `Date`, which compares by its time.
    name: "a Date a codec decodes, under a serializer pair that revives it",
    route: "events",
    build: () => serverPayload(DAY_PATH, "FROM-SERVER", REVIVING_WIRE),
  },
];

let router: Router;

describe("the hydration scratchpad is keyed by state, not route name (#2060)", () => {
  beforeEach(() => {
    router = createRouter(routes, { defaultRoute: "home" });
  });

  afterEach(() => {
    router.stop();
  });

  it.each(MISMATCHES)(
    "$name → the loader runs instead of serving the payload",
    async ({ route, build }) => {
      const loader = vi.fn(() => "FRESH");

      router.usePlugin(
        ssrDataPluginFactory({ [route ?? "users.profile"]: () => loader }),
      );

      const state = await hydrateRouter(
        router,
        (await build()) as unknown as { path: string },
      );

      expect(loader).toHaveBeenCalledTimes(1);
      expect(state.context.data).toBe("FRESH");
    },
  );

  it.each(AGREEMENTS)(
    "$name → the payload is served and the loader skipped",
    async ({ route, build }) => {
      const loader = vi.fn(() => "FRESH");

      router.usePlugin(
        ssrDataPluginFactory({ [route ?? "users.profile"]: () => loader }),
      );

      const state = await hydrateRouter(
        router,
        (await build()) as unknown as { path: string },
      );

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toBe("FROM-SERVER");
    },
  );

  it.each([
    ["/users/42", "plain"],
    ["/users/42?tab=9", "with a query"],
    ["/users/42?tag=a&tag=b", "with a repeated query key"],
  ])(
    "CONTROL — an untouched server payload for %s (%s) still skips the loader",
    async (path) => {
      const loader = vi.fn(() => "FRESH");
      const payload = await serverPayload(path, "FROM-SERVER");

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));

      const state = await hydrateRouter(
        router,
        payload as unknown as { path: string },
      );

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toBe("FROM-SERVER");
    },
  );

  it("CONTROL — the reviving pair hands back a Date and a Set, not their JSON", async () => {
    // Without it the `Set` row passes vacuously: a payload whose tag was never
    // revived disagrees too.
    const day = await serverPayload(DAY_PATH, "", REVIVING_WIRE);
    const tagged = await serverPayload("/tagged?tags=a,b", "", REVIVING_WIRE);

    expect((day.search as Payload).from).toStrictEqual(new Date("2024-03-15"));
    expect((tagged.search as Payload).tags).toStrictEqual(new Set(["a", "b"]));
  });

  it("CONTROL — a hand-built payload that omits both channels still skips the loader", async () => {
    const loader = vi.fn(() => "FRESH");

    router.usePlugin(ssrDataPluginFactory({ "users.list": () => loader }));

    // A route with no params and no query: an absent channel is "no keys",
    // which is what `hydrateRouter`'s `{ path }` object source carries.
    const state = await hydrateRouter(router, {
      name: "users.list",
      path: "/users/",
      context: { data: "BUILT-BY-HAND" },
    } as unknown as { path: string });

    expect(loader).not.toHaveBeenCalled();
    expect(state.context.data).toBe("BUILT-BY-HAND");
  });

  it("CONTROL — a payload for a different ROUTE was already refused", async () => {
    const loader = vi.fn(() => "FRESH");
    const payload = await serverPayload("/users/42", "STALE");

    router.usePlugin(ssrDataPluginFactory({ "users.list": () => loader }));

    const state = await hydrateRouter(router, {
      ...payload,
      path: "/users/",
    });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(state.context.data).toBe("FRESH");
  });
});
