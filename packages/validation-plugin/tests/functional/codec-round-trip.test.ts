import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { describe, it, expect, vi } from "vitest";

import { validationPlugin } from "../../src";

import type { ParamsSearch, Route, Router } from "@real-router/core";

/**
 * The codec round-trip diagnostic (#2905).
 *
 * `navigate` takes params in the form `decodeParams` returns and never runs
 * it; a reload hands the URL to `matchPath`, which does. A link and a reload of
 * one URL commit the same state only when the route's decoder undoes its
 * encoder and adds no key, and the diagnostic reports each key of a committed
 * state for which they do not.
 *
 * A warning cell shows through `matchPath` the reload it predicts. The inverse
 * pairs are the CONTROLS: a diagnostic that warned about every codec would
 * pass each cell that expects a warning.
 */

interface Fixture {
  readonly router: Router;
  /**
   * `[channel, message]` of every entry the router logged. An entry at another
   * level than `warn` carries that level in its channel.
   */
  readonly warnings: (readonly [string, string])[];
}

function logged(routes: Route[]): Fixture {
  const warnings: (readonly [string, string])[] = [];
  const router = createRouter(routes, {
    logger: {
      level: "none",
      callbackIgnoresLevel: true,
      callback: (level, channel, message) => {
        warnings.push([
          level === "warn" ? channel : `${level}: ${channel}`,
          message,
        ]);
      },
    },
  });

  return { router, warnings };
}

function validated(routes: Route[]): Fixture {
  const fixture = logged(routes);

  fixture.router.usePlugin(validationPlugin());

  return fixture;
}

async function started(routes: Route[]): Promise<Fixture> {
  const fixture = validated(routes);

  await fixture.router.start("/home");

  return fixture;
}

const HOME: Route = { name: "home", path: "/home" };

/** The README's product route: a number in the state, its string in the URL. */
const PRODUCT: Route = {
  name: "product",
  path: "/product/:id",
  encodeParams: ({ params: { id }, search }) => ({
    params: { id: (id as number).toString() },
    search,
  }),
  decodeParams: ({ params: { id }, search }) => ({
    params: { id: Number(id) },
    search,
  }),
};

/** A decoder that derives a key from the URL — the shape #2905 was found on. */
const CARS: Route = {
  name: "cars",
  path: "/cars/:slug",
  decodeParams: ({ params, search }) => ({
    params: { ...params, kind: "car" },
    search,
  }),
};

/** A decoder that normalises a path slot and a query array. */
const TAGS: Route = {
  name: "tags",
  path: "/tags/:tag?also",
  decodeParams: ({ params, search }) => ({
    params: { ...params, tag: (params.tag as string).toLowerCase() },
    search: {
      ...search,
      also: Array.isArray(search.also)
        ? search.also.map((tag) => String(tag).toLowerCase())
        : search.also,
    },
  }),
};

/** An encoder that normalises, with no decoder to undo it. */
const ARTICLES: Route = {
  name: "articles",
  path: "/articles/:slug",
  encodeParams: ({ params, search }) => ({
    params: { ...params, slug: (params.slug as string).toLowerCase() },
    search,
  }),
};

/** A decoder that rebuilds the query channel from the one key it parses. */
const LIST: Route = {
  name: "list",
  path: "/list?page&sort",
  decodeParams: ({ params, search }) => ({
    params,
    search: { page: Number(search.page) },
  }),
};

/** An encoder that keeps every key, and a decoder that rebuilds the bag. */
const USERS: Route = {
  name: "users",
  path: "/users/:id",
  encodeParams: ({ params, search }) => ({
    params: { ...params, id: (params.id as number).toString() },
    search,
  }),
  decodeParams: ({ params: { id }, search }) => ({
    params: { id: Number(id) },
    search,
  }),
};

/** A decoder-only route reading its path slots as the strings a URL holds. */
const FLAGS: Route = {
  name: "flags",
  path: "/flags/:id/:on",
  decodeParams: ({ params, search }) => ({
    params: { ...params, id: Number(params.id), on: params.on === "true" },
    search,
  }),
};

/** A pair that writes `undefined` for a query key the state does not carry. */
const FEED: Route = {
  name: "feed",
  path: "/feed?page",
  encodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      page: search.page === undefined ? undefined : String(search.page),
    },
  }),
  decodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      page: search.page === undefined ? undefined : Number(search.page),
    },
  }),
};

interface Point {
  readonly lat: number;
  readonly lng: number;
}

// Throws on a value that is not a point, as an encoder written for one does.
function printPoint(value: unknown): string {
  const { lat, lng } = value as Point;

  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function parsePoint(value: unknown): Record<string, number> {
  const [lat, lng] = (typeof value === "string" ? value : "").split(",", 2);

  return { lat: Number(lat), lng: Number(lng) };
}

/** A pair over two objects, each printed as `lat,lng`. */
const DIRECTIONS: Route = {
  name: "directions",
  path: "/directions/:from/:to",
  encodeParams: ({ params, search }) => ({
    params: {
      ...params,
      from: printPoint(params.from),
      to: printPoint(params.to),
    },
    search,
  }),
  decodeParams: ({ params, search }) => ({
    params: {
      ...params,
      from: parsePoint(params.from),
      to: parsePoint(params.to),
    },
    search,
  }),
};

/** The same encoder, and a decoder that parses one of the two points. */
const HALF: Route = {
  ...DIRECTIONS,
  name: "half",
  path: "/half/:from/:to",
  decodeParams: ({ params, search }) => ({
    params: { ...params, from: parsePoint(params.from) },
    search,
  }),
};

const SORTS = new Set(["date", "name"]);

/** A decoder that refuses a value it does not know. */
const SORTED: Route = {
  name: "sorted",
  path: "/sorted?sort",
  decodeParams: (channels) => {
    if (!SORTS.has(String(channels.search.sort))) {
      throw new RangeError("unknown sort");
    }

    return channels;
  },
};

/** A codec's answer with one channel, which the declared type does not admit. */
function oneChannel(channels: Partial<ParamsSearch>): ParamsSearch {
  return channels as ParamsSearch;
}

/** Codecs that each return the one channel they transform (#2896). */
const PAGES: Route = {
  name: "pages",
  path: "/pages/:n",
  encodeParams: ({ params }) =>
    oneChannel({ params: { ...params, n: (params.n as number).toString() } }),
  decodeParams: ({ params }) =>
    oneChannel({ params: { ...params, n: Number(params.n) } }),
};

const QUERY: Route = {
  name: "query",
  path: "/query?q",
  decodeParams: ({ search }) =>
    oneChannel({ search: { ...search, q: String(search.q).trim() } }),
};

const ROUTES = [
  HOME,
  PRODUCT,
  CARS,
  TAGS,
  ARTICLES,
  LIST,
  USERS,
  FLAGS,
  FEED,
  DIRECTIONS,
  HALF,
  SORTED,
  PAGES,
  QUERY,
  { name: "plain", path: "/plain" },
  { name: "old", path: "/old/:slug", forwardTo: "cars" },
];

describe("validation-plugin — codec round-trip diagnostic (#2905)", () => {
  describe("what it reports", () => {
    it("a key the decoder adds: a reload carries it, a link does not", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate("cars", { slug: "bmw" });

      // Core's behaviour is unchanged: the link commits the caller's params.
      expect(state.params).toStrictEqual({ slug: "bmw" });
      expect(getPluginApi(router).matchPath(state.path)?.params).toStrictEqual({
        slug: "bmw",
        kind: "car",
      });
      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "cars": its codec adds "kind" to state.params, so a link commits a state ` +
            `without it and a reload of the same URL commits one with it. Derive "kind" in a ` +
            `forwardState interceptor instead: navigate and matchPath both run it.`,
        ],
      ]);

      router.stop();
    });

    it("a value the decoder does not give back, in a slot and in a query array", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate(
        "tags",
        { tag: "React" },
        { also: ["Vue", "Svelte"] },
      );

      expect(getPluginApi(router).matchPath(state.path)?.params).toStrictEqual({
        tag: "react",
      });
      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "tags": its codec changes "tag" in state.params, so a link and a reload of ` +
            `the same URL commit different values. With no encodeParams, decodeParams must ` +
            `return each value so that it prints as the URL shows it.`,
        ],
        ["router", expect.stringContaining(`changes "also" in state.search`)],
      ]);

      router.stop();
    });

    it("a value the encoder changes and no decoder undoes", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate("articles", { slug: "Hello" });

      expect(state.params).toStrictEqual({ slug: "Hello" });
      expect(state.path).toBe("/articles/hello");
      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "articles": its codec changes "slug" in state.params, so a link and a ` +
            `reload of the same URL commit different values. The route has an encodeParams ` +
            `and no decodeParams to undo it.`,
        ],
      ]);

      router.stop();
    });

    it("a query key the decoder drops", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate(
        "list",
        {},
        { page: 2, sort: "name" },
      );

      expect(getPluginApi(router).matchPath(state.path)?.search).toStrictEqual({
        page: 2,
      });
      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "list": its codec drops "sort" from state.search, so a reload of the URL a ` +
            `link builds loses it. With no encodeParams, decodeParams must return each value ` +
            `so that it prints as the URL shows it.`,
        ],
      ]);

      router.stop();
    });

    it("a root slot the decoder drops (#2895)", async () => {
      const { router, warnings } = validated(ROUTES);

      getPluginApi(router).setRootPath("/app/:tenant");
      await router.start("/app/acme/home");

      const state = await router.navigate("users", { tenant: "acme", id: 7 });
      const reloaded = getPluginApi(router).matchPath(state.path);

      expect(reloaded?.params).toStrictEqual({ id: 7 });
      // …and the reload's state cannot build its own URL.
      expect(() => router.buildPath("users", reloaded?.params)).toThrow(
        "Missing required param 'tenant'",
      );
      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "users": its codec drops "tenant" from state.params, so a reload of the URL ` +
            `a link builds loses it. decodeParams must undo encodeParams.`,
        ],
      ]);

      router.stop();
    });

    it("an object the decoder does not parse back, and not its parsed sibling", async () => {
      const { router, warnings } = await started(ROUTES);

      await router.navigate("half", {
        from: { lat: 1.5, lng: 2 },
        to: { lat: 3, lng: 4.25 },
      });

      // The encoder throws on the string the decoder leaves in `to`; `from`
      // still compares by the piece it prints.
      expect(warnings).toStrictEqual([
        ["router", expect.stringContaining(`changes "to" in state.params`)],
      ]);

      router.stop();
    });

    it("a codec that returns one channel, the other kept as core keeps it (#2896)", async () => {
      const { router, warnings } = await started(ROUTES);

      await router.navigate("query", {}, { q: " router " });

      expect(warnings).toStrictEqual([
        ["router", expect.stringContaining(`changes "q" in state.search`)],
      ]);

      router.stop();
    });
  });

  describe("what it does not report", () => {
    it("an inverse pair — the README's product route", async () => {
      const { router, warnings } = await started(ROUTES);

      await router.navigate("product", { id: 42 });
      // A string compares by its printed form, as `areStatesEqual` does.
      await router.navigate("product", { id: "7" });

      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("a path slot read as the string a URL holds", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate("flags", { id: 7, on: true });

      expect(getPluginApi(router).matchPath(state.path)?.params).toStrictEqual({
        id: 7,
        on: true,
      });
      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("an object rebuilt by the decoder: it compares by the piece the encoder prints", async () => {
      const { router, warnings } = await started(ROUTES);

      await router.navigate("directions", {
        from: { lat: 1.5, lng: 2 },
        to: { lat: 3, lng: 4.25 },
      });

      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("a key a codec writes as `undefined`", async () => {
      const { router, warnings } = await started(ROUTES);

      await router.navigate("feed");
      await router.navigate("feed", {}, { page: 3 });

      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("codecs that each return one channel and undo each other (#2896)", async () => {
      const { router, warnings } = await started(ROUTES);

      await router.navigate("pages", { n: 3 });

      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("an app-level key no URL carries (#1553): the undeclared-key diagnostic reports it", async () => {
      const { router, warnings } = await started(ROUTES);
      const consoleWarn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      // The README's codec rebuilds the bag, so `note` is not in the URL.
      const state = await router.navigate("product", { id: 1, note: "x" });

      expect(state.params).toStrictEqual({ id: 1, note: "x" });
      expect(warnings).toStrictEqual([]);
      expect(consoleWarn).toHaveBeenCalledTimes(1);
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining(`Param "note" is declared nowhere`),
      );

      consoleWarn.mockRestore();
      router.stop();
    });

    it("a codec that throws on the round trip, and the navigation is unaffected", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate("sorted", {}, { sort: "size" });

      expect(state.search).toStrictEqual({ sort: "size" });
      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("a codec answer that is not a pair of bags", async () => {
      const { router, warnings } = await started([
        HOME,
        {
          name: "arrayed",
          path: "/arrayed",
          encodeParams: ({ params }) =>
            ({ params, search: [] }) as unknown as ParamsSearch,
        },
        {
          name: "stringy",
          path: "/stringy/:id",
          decodeParams: ({ search }) =>
            ({ params: "id", search }) as unknown as ParamsSearch,
        },
      ]);

      await router.navigate("arrayed");
      await router.navigate("stringy", { id: "1" });

      expect(warnings).toStrictEqual([]);

      router.stop();
    });
  });

  describe("when it reports", () => {
    it("once per route + key", async () => {
      const { router, warnings } = await started(ROUTES);

      await router.navigate("cars", { slug: "bmw" });
      await router.navigate("cars", { slug: "audi" });
      await router.navigate("tags", { tag: "Vue" });

      expect(warnings).toStrictEqual([
        ["router", expect.stringContaining(`Route "cars": its codec adds`)],
        ["router", expect.stringContaining(`Route "tags": its codec changes`)],
      ]);

      router.stop();
    });

    it("again for a second router and for a clone: the cache is per router (#1583)", async () => {
      const first = await started(ROUTES);

      await first.router.navigate("cars", { slug: "bmw" });

      const second = await started(ROUTES);

      await second.router.navigate("cars", { slug: "bmw" });

      // ⚑ No `usePlugin` on the clone: `cloneRouter` re-runs plugin factories,
      // so it arrives validated, and it logs through the base's logger.
      const clone = cloneRouter(first.router);

      await clone.start("/home");
      await clone.navigate("cars", { slug: "bmw" });

      expect([first.warnings.length, second.warnings.length]).toStrictEqual([
        2, 1,
      ]);

      clone.stop();
      second.router.stop();
      first.router.stop();
    });

    it("again after the plugin is torn down and re-registered (#1583)", () => {
      // Pre-start, because the plugin refuses registration after `start()`.
      // `buildNavigationState` is the other committing producer.
      const { router, warnings } = logged(ROUTES);
      const unsubscribe = router.usePlugin(validationPlugin());

      getPluginApi(router).buildNavigationState("cars", { slug: "bmw" });

      expect(warnings).toHaveLength(1);

      unsubscribe();
      router.usePlugin(validationPlugin());
      getPluginApi(router).buildNavigationState("cars", { slug: "bmw" });

      expect(warnings).toHaveLength(2);
    });

    it("for the target of a forward, whose codec builds the state", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate("old", { slug: "bmw" });

      expect(state.name).toBe("cars");
      expect(warnings).toStrictEqual([
        ["router", expect.stringContaining(`Route "cars": its codec adds`)],
      ]);

      router.stop();
    });

    it("never from a predicate or from the URL direction", async () => {
      const { router, warnings } = await started(ROUTES);
      const api = getPluginApi(router);

      router.buildPath("cars", { slug: "bmw" });
      router.isActiveRoute("cars", { slug: "bmw" });
      router.canNavigateTo("cars", { slug: "bmw" });
      api.makeState("cars", { slug: "bmw" });
      api.matchPath("/cars/bmw");

      expect(warnings).toStrictEqual([]);

      // The control: the same route reports from a committing producer.
      await router.navigate("cars", { slug: "bmw" });

      expect(warnings).toHaveLength(1);

      router.stop();
    });

    it("never without the plugin", async () => {
      const consoleWarn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      const router = createRouter(ROUTES);

      await router.start("/home");

      const state = await router.navigate("cars", { slug: "bmw" });

      expect(state.params).toStrictEqual({ slug: "bmw" });
      expect(consoleWarn).not.toHaveBeenCalled();

      consoleWarn.mockRestore();
      router.stop();
    });
  });
});
