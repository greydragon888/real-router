/// <reference lib="esnext.temporal" />
// ⚑ The package's `lib` is ES2023; `MIGRATED` decodes into a `Temporal.PlainDate`.

import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { describe, it, expect, vi } from "vitest";

import { validationPlugin } from "../../src";

import type {
  Params,
  ParamValue,
  ParamsSearch,
  Route,
  Router,
  SearchParams,
  SearchParamValue,
  SimpleState,
  State,
} from "@real-router/core";

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

type RouterOptions = NonNullable<Parameters<typeof createRouter>[1]>;

/** A route's `encodeParams` or `decodeParams`, for one shared by several routes. */
type Codec = (channels: ParamsSearch) => ParamsSearch;

/**
 * A query value, printed by an encoder below. `ParamValue` admits a plain
 * object, which `String` prints as `[object Object]`; these encoders are handed
 * strings and numbers, so the value is narrowed first.
 */
function printed(value: ParamValue): string {
  const urlValue = value as SearchParamValue;

  return String(urlValue);
}

function logged(routes: Route[], options: RouterOptions = {}): Fixture {
  const warnings: (readonly [string, string])[] = [];
  const router = createRouter(routes, {
    ...options,
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

function validated(routes: Route[], options: RouterOptions = {}): Fixture {
  const fixture = logged(routes, options);

  fixture.router.usePlugin(validationPlugin());

  return fixture;
}

async function started(
  routes: Route[],
  options: RouterOptions = {},
): Promise<Fixture> {
  const fixture = validated(routes, options);

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
    params: { ...params, tag: params.tag.toLowerCase() },
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
      page: search.page === undefined ? undefined : printed(search.page),
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

/** An encoder that returns only the channel it trims, and no decoder (#2896). */
const QUERY: Route = {
  name: "query",
  path: "/query?q",
  encodeParams: ({ search }) =>
    oneChannel({ search: { ...search, q: printed(search.q).trim() } }),
};

/** A decoder that returns only the channel it trims, which the plugin refuses on a reload (#2896). */
const TRIMMED: Route = {
  name: "trimmed",
  path: "/trimmed?q",
  decodeParams: ({ search }) =>
    oneChannel({ search: { ...search, q: String(search.q).trim() } }),
};

/** An encoder that prints a `Date` in `from` as its UTC day. */
const printDay: Codec = ({ params, search }) => {
  const from: unknown = search.from;

  return {
    params,
    search: {
      ...search,
      from: from instanceof Date ? from.toISOString().slice(0, 10) : from,
    } as SearchParams,
  };
};

/** A day codec: a `Date` printed as its UTC day, read back at that midnight. */
const EVENTS: Route = {
  name: "events",
  path: "/events?from",
  encodeParams: printDay,
  decodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      from:
        typeof search.from === "string" ? new Date(search.from) : search.from,
    },
  }),
};

/** The day encoder of {@link EVENTS} with no decoder to read the day back. */
const STAMPED: Route = {
  name: "stamped",
  path: "/stamped?from",
  encodeParams: printDay,
};

const DAY = 86_400_000;

/** The day encoder of {@link EVENTS} and a decoder a day off, as a time zone slip makes one. */
const SHIFTED: Route = {
  name: "shifted",
  path: "/shifted?from",
  encodeParams: printDay,
  decodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      from:
        typeof search.from === "string"
          ? new Date(Date.parse(search.from) - DAY)
          : search.from,
    },
  }),
};

/** An encoder that prints `from` as the UTC day of a `Date`, and cannot print anything else. */
const printDate: Codec = ({ params, search }) => ({
  params,
  search: {
    ...search,
    from: (search.from as unknown as Date).toISOString().slice(0, 10),
  },
});

/** A day encoder for a `Date` and a decoder that returns a `Temporal.PlainDate`. */
const MIGRATED: Route = {
  name: "migrated",
  path: "/migrated?from",
  encodeParams: printDate,
  decodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      from: Temporal.PlainDate.from(String(search.from)),
    } as unknown as SearchParams,
  }),
};

/** A value class with no `toString` of its own: its values have no key. */
class Box {
  constructor(readonly value: string) {}
}

/**
 * Its codec on the query channel: the plugin's path-bag walk refuses a class
 * instance as a path param value.
 */
const BOXED: Route = {
  name: "boxed",
  path: "/boxed?box",
  encodeParams: ({ params, search }) => {
    const box: unknown = search.box;

    return {
      params,
      search: {
        ...search,
        box: box instanceof Box ? box.value : box,
      } as SearchParams,
    };
  },
  decodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      box: typeof search.box === "string" ? new Box(search.box) : search.box,
    } as SearchParams,
  }),
};

/** The encoder of {@link MIGRATED}, which cannot print a string, and no decoder. */
const STRICT: Route = {
  name: "strict",
  path: "/strict?from",
  encodeParams: printDate,
};

/** A `Date` that carries the zone it was written in, as `@date-fns/tz`'s `TZDate` does. */
class ZonedDate extends Date {
  constructor(
    time: number,
    readonly zone: string,
  ) {
    super(time);
  }
}

/** An instant printed with its zone, and a decoder that drops the zone. */
const ZONED: Route = {
  name: "zoned",
  path: "/zoned?at",
  encodeParams: ({ params, search }) => {
    const at: unknown = search.at;
    const printed =
      at instanceof ZonedDate ? `${at.toISOString()}@${at.zone}` : at;

    return {
      params,
      search: {
        ...search,
        at: printed instanceof Date ? printed.toISOString() : printed,
      } as SearchParams,
    };
  },
  decodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      at:
        typeof search.at === "string"
          ? new Date(search.at.replace(/@.*/u, ""))
          : search.at,
    },
  }),
};

/** A filter holding a `Set`, printed as its members: JSON spells a `Set` `{}`. */
const TAGGED: Route = {
  name: "tagged",
  path: "/tagged?filter",
  encodeParams: ({ params, search }) => {
    const filter: unknown = search.filter;

    return {
      params,
      search: {
        ...search,
        filter:
          typeof filter === "object" && filter !== null
            ? [...(filter as { tags: Set<string> }).tags].join("~")
            : filter,
      } as SearchParams,
    };
  },
  decodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      filter:
        typeof search.filter === "string"
          ? { tags: new Set(search.filter.split("~")) }
          : search.filter,
    } as SearchParams,
  }),
};

/** The day codec of {@link EVENTS} over an array of days. */
const DAYS: Route = {
  name: "days",
  path: "/days?days",
  encodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      days: (search.days as unknown[]).map((day) =>
        day instanceof Date ? day.toISOString().slice(0, 10) : day,
      ),
    } as SearchParams,
  }),
  decodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      days: (search.days as unknown[]).map((day) =>
        typeof day === "string" ? new Date(day) : day,
      ),
    } as SearchParams,
  }),
};

/** {@link ARTICLES}' lower-casing encoder over a query array, with no decoder. */
const LOWER: Route = {
  name: "lower",
  path: "/lower?tags",
  encodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      tags: (search.tags as string[]).map((tag) => tag.toLowerCase()),
    },
  }),
};

/** A page object in a path slot, printed as its number. */
const PAGED: Route = {
  name: "paged",
  path: "/paged/:page",
  encodeParams: ({ params, search }) => ({
    params: { ...params, page: Math.floor((params.page as { n: number }).n) },
    search,
  }),
  decodeParams: ({ params, search }) => ({
    params: {
      ...params,
      page:
        typeof params.page === "string"
          ? { n: Number(params.page) }
          : params.page,
    },
    search,
  }),
};

/** A decoder alone, reading a `Date` back from the text core prints for it. */
const NOTED: Route = {
  name: "noted",
  path: "/noted?at",
  decodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      at: typeof search.at === "string" ? new Date(search.at) : search.at,
    },
  }),
};

/** A page object printed as its number's text, read back without parsing the text. */
const WRAPPED: Route = {
  name: "wrapped",
  path: "/wrapped?page",
  encodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      page: String((search.page as unknown as { n: unknown }).n),
    },
  }),
  decodeParams: ({ params, search }) => ({
    params,
    search: { ...search, page: { n: search.page } },
  }),
};

/** A filter printed as key-sorted JSON without its default page, read back by `JSON.parse`. */
const FILTERED: Route = {
  name: "filtered",
  path: "/filtered?filter",
  encodeParams: ({ params, search }) => {
    const { page, ...fields } = search.filter as unknown as Record<
      string,
      unknown
    >;
    const printed = page === 1 ? fields : { ...fields, page };

    return {
      params,
      search: {
        ...search,
        filter: JSON.stringify(
          Object.fromEntries(
            Object.entries(printed).toSorted(([a], [b]) => (a < b ? -1 : 1)),
          ),
        ),
      },
    };
  },
  decodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      filter:
        typeof search.filter === "string"
          ? (JSON.parse(search.filter) as unknown)
          : search.filter,
    } as SearchParams,
  }),
};

/** A page the encoder leaves out of the URL when it is the route's default. */
const FIRST_PAGE: Route = {
  name: "firstPage",
  path: "/first-page?page",
  defaultSearch: { page: 1 },
  encodeParams: ({ params, search }) => {
    const { page, ...rest } = search;

    return { params, search: page === 1 ? rest : search };
  },
};

/** The day codec of {@link EVENTS} over two keys. */
const SPAN: Route = {
  name: "span",
  path: "/span?from&to",
  encodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      from: (search.from as unknown as Date).toISOString().slice(0, 10),
      to: (search.to as unknown as Date).toISOString().slice(0, 10),
    },
  }),
  decodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      from: new Date(String(search.from)),
      to: new Date(String(search.to)),
    },
  }),
};

/** A query bag with its `from` and `to` mapped, where it has them. */
function mapDates(
  search: SearchParams,
  map: (value: unknown) => unknown,
): SearchParams {
  return Object.fromEntries(
    Object.entries(search).map(([key, value]) => [
      key,
      key === "from" || key === "to" ? map(value) : value,
    ]),
  ) as SearchParams;
}

/** The day codec of {@link SPAN} over the dates of a stay, which a link may leave out. */
const STAY: Route = {
  name: "stay",
  path: "/stay?city&from&to",
  encodeParams: ({ params, search }) => ({
    params,
    search: mapDates(search, (value) =>
      value instanceof Date ? value.toISOString().slice(0, 10) : value,
    ),
  }),
  decodeParams: ({ params, search }) => ({
    params,
    search: mapDates(search, (value) =>
      typeof value === "string" ? new Date(value) : value,
    ),
  }),
};

/** A static sibling, and a detail route whose encoder prints one id as its segment. */
const ITEM_ROUTES: Route[] = [
  { name: "home", path: "/home" },
  { name: "itemNew", path: "/items/new" },
  {
    name: "item",
    path: "/items/:id",
    encodeParams: ({ params, search }) => ({
      params: { ...params, id: params.id === "draft" ? "new" : params.id },
      search,
    }),
  },
];

/** A query the encoder prints upper-case and the decoder reads back lower-case. */
const SHOUTED: Route = {
  name: "shouted",
  path: "/shouted?q&lang",
  encodeParams: ({ params, search }) => ({
    params,
    search: { ...search, q: printed(search.q).toUpperCase() },
  }),
  decodeParams: ({ params, search }) => ({
    params,
    search: { ...search, q: String(search.q).toLowerCase() },
  }),
};

/** Tags printed comma-joined, and an empty list left out of the URL. */
const TAGGED_LIST: Route = {
  name: "taggedList",
  path: "/tagged-list?filter",
  encodeParams: ({ params, search }) => {
    const { filter, ...rest } = search;
    const { tags } = filter as unknown as { tags: string[] };

    return {
      params,
      search: tags.length === 0 ? rest : { ...rest, filter: tags.join(",") },
    };
  },
  // Reads a missing filter back in another shape than the encoder takes.
  decodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      filter:
        typeof search.filter === "string"
          ? { tags: search.filter.split(",") }
          : { list: [] },
    },
  }),
};

/**
 * Prints `n` as text, and derives `whole` only from a number, which the URL's
 * parse gives for `n` under the default `numberFormat`.
 */
const ROUNDED: Route = {
  name: "rounded",
  path: "/rounded?n",
  encodeParams: ({ params, search }) => ({
    params,
    search: { ...search, n: printed(search.n) },
  }),
  decodeParams: ({ params, search }) => ({
    params,
    search:
      typeof search.n === "number"
        ? { ...search, whole: search.n.toFixed(0) }
        : search,
  }),
};

/** A clean URL: the encoder leaves the defaults out, the decoder fills them in. */
const LISTING: Route = {
  name: "listing",
  path: "/listing?q&page&sort",
  encodeParams: ({ params, search }) => ({
    params,
    search: {
      ...search,
      page: search.page === 1 ? undefined : search.page,
      sort: search.sort === "relevance" ? undefined : search.sort,
    },
  }),
  decodeParams: ({ params, search }) => ({
    params,
    search: { page: 1, sort: "relevance", ...search },
  }),
};

/** A decoder that fills a default language in for a URL that carries none. */
const DEFAULTED: Route = {
  name: "defaulted",
  path: "/defaulted?q&lang",
  decodeParams: ({ params, search }) => ({
    params,
    search: { lang: "en", ...search },
  }),
};

/** A decoder that sorts the tags it is handed in place, and counts them. */
const SORTED_TAGS: Route = {
  name: "sortedTags",
  path: "/sorted-tags?tags",
  decodeParams: ({ params, search }) => {
    // eslint-disable-next-line unicorn/no-array-sort -- the shape under test sorts its input in place
    const tags = (search.tags as string[]).sort((a, b) => a.localeCompare(b));

    return { params, search: { ...search, tags, count: tags.length } };
  },
};

/** A value class with no `toString` of its own, so it compares by identity. */
class Tag {
  constructor(readonly text: string) {}
}

/** A query bag holding values the declared types do not admit. */
const searchOf = (bag: Record<string, unknown>): SearchParams =>
  bag as SearchParams;

/**
 * A `forwardState` interceptor that carries `lang` over from the state the
 * router is on, as a sticky query param does: a caller's own `lang`, its
 * `undefined` included, wins.
 */
function carryLang(router: Router): void {
  getPluginApi(router).addInterceptor(
    "forwardState",
    (next, routeName, routeParams, routeSearch) => {
      const lang = router.getState()?.search.lang;

      return next(
        routeName,
        routeParams,
        lang === undefined ? routeSearch : { lang, ...routeSearch },
      );
    },
  );
}

/**
 * A `forwardState` interceptor that rebuilds `filter` as a search schema does:
 * its own key order, and a default page.
 */
function rebuildFilter(router: Router): void {
  getPluginApi(router).addInterceptor(
    "forwardState",
    (next, routeName, routeParams, routeSearch) => {
      const forwarded = next(routeName, routeParams, routeSearch);
      const filter = forwarded.search.filter as unknown;

      if (typeof filter !== "object" || filter === null) {
        return forwarded;
      }

      const { status, owner, page } = filter as Record<string, unknown>;

      return {
        ...forwarded,
        search: searchOf({
          ...forwarded.search,
          filter: { status, owner, page: page ?? 1 },
        }),
      };
    },
  );
}

/** How many times the `forwardState` interceptors run on one navigation. */
async function forwardStateRuns(
  fixture: Fixture,
  name: string,
  search: SearchParams,
): Promise<number> {
  let runs = 0;

  await fixture.router.start("/home");
  getPluginApi(fixture.router).addInterceptor(
    "forwardState",
    (next, routeName, routeParams, routeSearch) => {
      runs++;

      return next(routeName, routeParams, routeSearch);
    },
  );
  await fixture.router.navigate(name, {}, search);
  fixture.router.stop();

  return runs;
}

/** A `forwardState` interceptor that reads `from` back as its day's midnight, as a search schema's date does. */
function readDayBack(router: Router): void {
  getPluginApi(router).addInterceptor(
    "forwardState",
    (next, routeName, routeParams, routeSearch) => {
      const forwarded = next(routeName, routeParams, routeSearch);
      const from: unknown = forwarded.search.from;

      return typeof from === "string"
        ? {
            ...forwarded,
            search: searchOf({ ...forwarded.search, from: new Date(from) }),
          }
        : forwarded;
    },
  );
}

/** What {@link EVENTS} reports about a `from` that is not its decoded form. */
const UNDECODED_FROM =
  `Route "events": its codec changes "from" in state.search, so a link and a reload of ` +
  `the same URL commit different values. encodeParams prints both as one piece of the ` +
  `URL, so a link must pass the value decodeParams returns for that piece.`;

/** What a reload of the URL a state prints commits. */
function reloadOf(router: Router, state: State): State {
  const reload = getPluginApi(router).matchPath(state.path);

  if (reload === undefined) {
    throw new Error(`no route matches ${state.path}`);
  }

  return reload;
}

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
  TRIMMED,
  NOTED,
  WRAPPED,
  FILTERED,
  FIRST_PAGE,
  SPAN,
  SHOUTED,
  TAGGED_LIST,
  ROUNDED,
  LISTING,
  DEFAULTED,
  SORTED_TAGS,
  EVENTS,
  STAMPED,
  SHIFTED,
  MIGRATED,
  BOXED,
  STRICT,
  ZONED,
  TAGGED,
  DAYS,
  LOWER,
  PAGED,
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

      // The decoder leaves `to` as the string the URL holds, and gives `from`
      // back as a plain object of the same fields.
      expect(warnings).toStrictEqual([
        ["router", expect.stringContaining(`changes "to" in state.params`)],
      ]);

      router.stop();
    });

    it("a value finer than the piece its encoder prints: a Date with a time under a day codec", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate(
        "events",
        {},
        searchOf({ from: new Date("2024-03-15T15:42:00.000Z") }),
      );

      // The reload decodes the day's midnight, which core tells apart from the
      // link's instant.
      expect(router.areStatesEqual(state, reloadOf(router, state), false)).toBe(
        false,
      );
      expect(warnings).toStrictEqual([["router", UNDECODED_FROM]]);

      router.stop();
    });

    it("the piece itself where the decoder returns a Date: a day string under a day codec", async () => {
      const { router, warnings } = await started(ROUTES);

      // What `<input type="date">` holds: the URL's own form of the value.
      const state = await router.navigate("events", {}, { from: "2024-03-15" });

      expect(router.areStatesEqual(state, reloadOf(router, state), false)).toBe(
        false,
      );
      expect(warnings).toStrictEqual([["router", UNDECODED_FROM]]);

      router.stop();
    });

    it("a decoder a day off: the remedy names the codec", async () => {
      const { router, warnings } = await started(ROUTES);

      await router.navigate(
        "shifted",
        {},
        searchOf({ from: new Date("2024-03-15T00:00:00.000Z") }),
      );

      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "shifted": its codec changes "from" in state.search, so a link and a reload of ` +
            `the same URL commit different values. decodeParams must undo encodeParams.`,
        ],
      ]);

      router.stop();
    });

    it("a decoder that returns what the encoder cannot print: the remedy names the codec", async () => {
      const { router, warnings } = await started(ROUTES);

      await router.navigate(
        "migrated",
        {},
        searchOf({ from: new Date("2024-03-15T00:00:00.000Z") }),
      );

      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "migrated": its codec changes "from" in state.search, so a link and a reload of ` +
            `the same URL commit different values. decodeParams must undo encodeParams.`,
        ],
      ]);

      router.stop();
    });

    it("an object the URL hands back as a piece its encoder cannot print: the remedy names the decoder", async () => {
      const { router, warnings } = await started(ROUTES);

      // A Date exactly as fine as its piece, so only the missing decoder loses it.
      await router.navigate(
        "strict",
        {},
        searchOf({ from: new Date("2024-03-15T00:00:00.000Z") }),
      );

      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "strict": its codec changes "from" in state.search, so a link and a reload of ` +
            `the same URL commit different values. The route has an encodeParams and no ` +
            `decodeParams to undo it.`,
        ],
      ]);

      router.stop();
    });

    it("an object the decoder gives back equal and prints differently: a zone the decoder drops", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate(
        "zoned",
        {},
        searchOf({
          at: new ZonedDate(
            Date.parse("2024-03-15T00:00:00.000Z"),
            "Asia/Bangkok",
          ),
        }),
      );
      const reload = reloadOf(router, state);

      // Core compares a Date by its time, so the two states compare equal while
      // the reload rewrites the URL without the zone.
      expect(router.areStatesEqual(state, reload, false)).toBe(true);
      expect(reload.path).not.toBe(state.path);
      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "zoned": its codec changes "at" in state.search, so a link and a reload of ` +
            `the same URL commit different values. decodeParams must undo encodeParams.`,
        ],
      ]);

      router.stop();
    });

    it("an object with no key to compare by: a class without a toString of its own", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate(
        "boxed",
        {},
        searchOf({ box: new Box("a") }),
      );

      expect(router.areStatesEqual(state, reloadOf(router, state), false)).toBe(
        false,
      );
      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "boxed": its codec changes "box" in state.search, so a link and a reload of ` +
            `the same URL commit different values. Two reloads of one URL decode values that ` +
            `never compare equal: give the value a key — a Date, or a plain object ` +
            `JSON.stringify prints in full.`,
        ],
      ]);

      router.stop();
    });

    it("an object with no key to compare by: a plain object holding a Set", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate(
        "tagged",
        {},
        searchOf({ filter: { tags: new Set(["a", "b"]) } }),
      );

      expect(router.areStatesEqual(state, reloadOf(router, state), false)).toBe(
        false,
      );
      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "tagged": its codec changes "filter" in state.search, so a link and a reload of ` +
            `the same URL commit different values. Two reloads of one URL decode values that ` +
            `never compare equal: give the value a key — a Date, or a plain object ` +
            `JSON.stringify prints in full.`,
        ],
      ]);

      router.stop();
    });

    it("an array of Dates one of which is finer than its piece", async () => {
      const { router, warnings } = await started(ROUTES);

      await router.navigate(
        "days",
        {},
        searchOf({
          days: [
            new Date("2024-03-15T00:00:00.000Z"),
            new Date("2024-03-16T15:42:00.000Z"),
          ],
        }),
      );

      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "days": its codec changes "days" in state.search, so a link and a reload of ` +
            `the same URL commit different values. encodeParams prints both as one piece of the ` +
            `URL, so a link must pass the value decodeParams returns for that piece.`,
        ],
      ]);

      router.stop();
    });

    it("an array the encoder changes and no decoder undoes", async () => {
      const { router, warnings } = await started(ROUTES);

      await router.navigate("lower", {}, { tags: ["Router", "Vue"] });

      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "lower": its codec changes "tags" in state.search, so a link and a reload of ` +
            `the same URL commit different values. The route has an encodeParams and no ` +
            `decodeParams to undo it.`,
        ],
      ]);

      router.stop();
    });

    it("an object finer than its piece beside a sibling the decoder leaves as its piece", async () => {
      const { router, warnings } = await started(ROUTES);

      // `from` comes back rounded to the printed precision; `to` comes back as
      // the string the URL holds, which the encoder cannot print.
      await router.navigate("half", {
        from: { lat: 1.23456, lng: 2 },
        to: { lat: 3, lng: 4.25 },
      });

      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "half": its codec changes "from" in state.params, so a link and a reload of ` +
            `the same URL commit different values. encodeParams prints both as one piece of the ` +
            `URL, so a link must pass the value decodeParams returns for that piece.`,
        ],
        [
          "router",
          `Route "half": its codec changes "to" in state.params, so a link and a reload of ` +
            `the same URL commit different values. decodeParams must undo encodeParams.`,
        ],
      ]);

      router.stop();
    });

    it("an object finer than the number its encoder prints into a path slot", async () => {
      const { router, warnings } = await started(ROUTES);

      // The second read takes the slot as the string a URL holds, as a reload does.
      await router.navigate("paged", { page: { n: 1.5 } });

      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "paged": its codec changes "page" in state.params, so a link and a reload of ` +
            `the same URL commit different values. encodeParams prints both as one piece of the ` +
            `URL, so a link must pass the value decodeParams returns for that piece.`,
        ],
      ]);

      router.stop();
    });

    it("a codec that returns one channel, the other kept as core keeps it (#2896)", async () => {
      const { router, warnings } = await started(ROUTES);

      await router.navigate("query", {}, { q: " router " });

      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "query": its codec changes "q" in state.search, so a link and a reload of the ` +
            `same URL commit different values. The route has an encodeParams and no ` +
            `decodeParams to undo it.`,
        ],
      ]);

      router.stop();
    });

    it("an object nothing reads back from its piece: a reload commits the piece", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate(
        "stamped",
        {},
        searchOf({ from: new Date("2024-03-15T00:00:00.000Z") }),
      );

      expect(reloadOf(router, state).search.from).toBe("2024-03-15");
      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "stamped": its codec changes "from" in state.search, so a link and a reload of ` +
            `the same URL commit different values. The route has an encodeParams and no ` +
            `decodeParams to undo it.`,
        ],
      ]);

      router.stop();
    });

    it("a Date the URL prints without its milliseconds, under a decoder alone", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate(
        "noted",
        {},
        searchOf({ at: new Date("2024-03-15T10:30:45.123Z") }),
      );

      expect(router.areStatesEqual(state, reloadOf(router, state), false)).toBe(
        false,
      );
      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "noted": its codec changes "at" in state.search, so a link and a reload of the ` +
            `same URL commit different values. With no encodeParams, decodeParams must return ` +
            `each value so that it prints as the URL shows it.`,
        ],
      ]);

      router.stop();
    });

    it("a number the URL hands back as its text: an object holding it, under numberFormat none", async () => {
      const { router, warnings } = await started(ROUTES, {
        queryParams: { numberFormat: "none" },
      });

      const state = await router.navigate(
        "wrapped",
        {},
        searchOf({ page: { n: 2 } }),
      );

      expect(reloadOf(router, state).search.page).toStrictEqual({ n: "2" });
      expect(warnings).toStrictEqual([
        [
          "router",
          expect.stringContaining(
            `changes "page" in state.search, so a link and a reload of the same URL commit ` +
              `different values. encodeParams prints both as one piece`,
          ),
        ],
      ]);

      router.stop();
    });

    it("a value the encoder cannot print, under a key it leaves out of the URL for the link's value", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate(
        "taggedList",
        {},
        searchOf({ filter: { tags: [] } }),
      );

      // The router's own reload rebuilds the path from what it decoded, and fails.
      expect(() => reloadOf(router, state)).toThrow(TypeError);
      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "taggedList": its codec changes "filter" in state.search, so a link and a ` +
            `reload of the same URL commit different values. decodeParams must undo encodeParams.`,
        ],
      ]);

      router.stop();
    });

    it("a key the decoder derives from the number the URL's parse gives", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate("rounded", {}, { n: 2 });

      expect(reloadOf(router, state).search.whole).toBe("2");
      expect(warnings).toStrictEqual([
        [
          "router",
          expect.stringContaining(`Route "rounded": its codec adds "whole"`),
        ],
      ]);

      router.stop();
    });

    it("the defaults a decoder fills in for an encoder that leaves them out of the URL", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate("listing", {}, { q: "shoes" });

      expect(reloadOf(router, state).search).toStrictEqual({
        page: 1,
        sort: "relevance",
        q: "shoes",
      });
      expect(warnings).toStrictEqual([
        [
          "router",
          expect.stringContaining(`Route "listing": its codec adds "page"`),
        ],
        [
          "router",
          expect.stringContaining(`Route "listing": its codec adds "sort"`),
        ],
      ]);

      router.stop();
    });

    it("the key the decoder derives, beside one a forwardState interceptor carries over", async () => {
      const { router, warnings } = validated(ROUTES);

      carryLang(router);
      await router.start("/home");
      await router.navigate("shouted", {}, { q: "a", lang: "en" });

      const state = await router.navigate(
        "rounded",
        {},
        { n: 2, lang: undefined },
      );

      expect(state.search).toStrictEqual({ n: 2 });
      expect(reloadOf(router, state).search).toStrictEqual({
        n: 2,
        whole: "2",
      });
      expect(warnings).toStrictEqual([
        [
          "router",
          expect.stringContaining(`Route "rounded": its codec adds "whole"`),
        ],
      ]);

      router.stop();
    });

    it("a key a reload adds, when the forward chain throws over the reload", async () => {
      const { router, warnings } = validated(ROUTES);
      let runs = 0;

      await router.start("/home");
      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, routeName, routeParams, routeSearch) => {
          runs++;

          if (runs >= 3) {
            throw new Error("a run of the forward chain past the navigation");
          }

          return next(routeName, routeParams, routeSearch);
        },
      );
      await router.navigate("listing", {}, { q: "shoes" });

      expect(runs).toBe(3);
      expect(warnings).toStrictEqual([
        ["router", expect.stringContaining(`codec adds "page"`)],
        ["router", expect.stringContaining(`codec adds "sort"`)],
      ]);

      router.stop();
    });

    it("a key a reload adds, when the forward chain answers no query bag", async () => {
      const { router, warnings } = validated(ROUTES);

      await router.start("/home");
      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, routeName, routeParams, routeSearch) => {
          const forwarded = next(routeName, routeParams, routeSearch);

          return forwarded.search.page === undefined
            ? ({
                name: forwarded.name,
                params: forwarded.params,
              } as SimpleState)
            : forwarded;
        },
      );
      await router.navigate("listing");

      expect(warnings).toStrictEqual([
        ["router", expect.stringContaining(`codec adds "page"`)],
        ["router", expect.stringContaining(`codec adds "sort"`)],
      ]);

      router.stop();
    });

    it("a key a reload adds, when the forward chain answers a bag that throws when read", async () => {
      const { router, warnings } = validated(ROUTES);
      let runs = 0;

      await router.start("/home");
      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, routeName, routeParams, routeSearch) => {
          const forwarded = next(routeName, routeParams, routeSearch);

          runs++;

          return runs < 3
            ? forwarded
            : {
                ...forwarded,
                search: new Proxy(forwarded.search, {
                  get() {
                    throw new Error("a bag read past the navigation");
                  },
                }),
              };
        },
      );
      await router.navigate("listing", {}, { q: "shoes" });

      expect(warnings).toStrictEqual([
        ["router", expect.stringContaining(`codec adds "page"`)],
        ["router", expect.stringContaining(`codec adds "sort"`)],
      ]);

      router.stop();
    });

    it("a key a reload adds, when the forward chain gives it back in a value that throws when compared", async () => {
      const { router, warnings } = validated(ROUTES);
      let runs = 0;

      await router.start("/home");
      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, routeName, routeParams, routeSearch) => {
          const forwarded = next(routeName, routeParams, routeSearch);

          runs++;

          return runs < 3
            ? forwarded
            : {
                ...forwarded,
                search: {
                  ...forwarded.search,
                  sort: new Proxy(["relevance"], {
                    get(target, property, receiver) {
                      if (property === "length") {
                        throw new Error("a length that cannot be read");
                      }

                      return Reflect.get(target, property, receiver);
                    },
                  }),
                },
              };
        },
      );
      await router.navigate("listing", {}, { q: "shoes" });

      expect(warnings).toStrictEqual([
        ["router", expect.stringContaining(`codec adds "page"`)],
        ["router", expect.stringContaining(`codec adds "sort"`)],
      ]);

      router.stop();
    });

    it("a key an interceptor derives from a default the route fills, in a type the URL gives otherwise", async () => {
      const { router, warnings } = validated([
        ...ROUTES,
        {
          name: "pageDefault",
          path: "/page-default?page&isFirst",
          defaultSearch: { page: "1" },
          decodeParams: ({ params, search }) => ({ params, search }),
        },
      ]);

      await router.start("/home");
      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, routeName, routeParams, routeSearch) => {
          const forwarded = next(routeName, routeParams, routeSearch);
          const { page } = forwarded.search;

          return page === undefined
            ? forwarded
            : {
                ...forwarded,
                search: { ...forwarded.search, isFirst: page === 1 },
              };
        },
      );

      const state = await router.navigate("pageDefault");

      expect(state.search).toStrictEqual({ page: "1" });
      expect(reloadOf(router, state).search).toStrictEqual({
        isFirst: true,
        page: 1,
      });
      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("a params key an interceptor derives from a default the route fills, in a type the URL gives otherwise", async () => {
      const { router, warnings } = validated([
        ...ROUTES,
        {
          name: "pageSlot",
          path: "/page-slot/:page",
          defaultParams: { page: 1 },
          decodeParams: ({ params, search }) => ({ params, search }),
        },
      ]);

      await router.start("/home");
      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, routeName, routeParams, routeSearch) => {
          const forwarded = next(routeName, routeParams, routeSearch);
          const { page } = forwarded.params;

          return page === undefined
            ? forwarded
            : {
                ...forwarded,
                params: { ...forwarded.params, isFirst: page === 1 },
              };
        },
      );

      const state = await router.navigate("pageSlot");

      expect(state.params).toStrictEqual({ page: 1 });
      expect(reloadOf(router, state).params).toStrictEqual({
        isFirst: false,
        page: "1",
      });
      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("a params key an interceptor gives back, when the forward chain answers no query bag", async () => {
      const { router, warnings } = validated([
        ...ROUTES,
        {
          name: "pageSlot",
          path: "/page-slot/:page",
          defaultParams: { page: 1 },
          decodeParams: ({ params, search }) => ({ params, search }),
        },
      ]);

      await router.start("/home");
      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, routeName, routeParams, routeSearch) => {
          const forwarded = next(routeName, routeParams, routeSearch);
          const { page } = forwarded.params;

          if (page === undefined) {
            return forwarded;
          }

          const params: Params = { ...forwarded.params, isFirst: page === 1 };

          return { name: forwarded.name, params } as SimpleState;
        },
      );

      const state = await router.navigate("pageSlot");

      expect(reloadOf(router, state).params).toStrictEqual({
        isFirst: false,
        page: "1",
      });
      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("a flag the encoder prints as a bare key, which the decoder does not give back", async () => {
      const { router, warnings } = validated([
        ...ROUTES,
        {
          name: "bareFlag",
          path: "/bare-flag?flag&q",
          encodeParams: ({ params, search }) => ({
            params,
            search: {
              ...search,
              flag: search.flag === true ? null : search.flag,
            },
          }),
          decodeParams: ({ params, search }) => ({ params, search }),
        },
      ]);

      await router.start("/home");

      const state = await router.navigate(
        "bareFlag",
        {},
        { flag: true, q: "x" },
      );

      expect(state.path).toBe("/bare-flag?flag&q=x");
      expect(reloadOf(router, state).search).toStrictEqual({
        flag: null,
        q: "x",
      });
      expect(warnings).toStrictEqual([
        [
          "router",
          `Route "bareFlag": its codec changes "flag" in state.search, so a link and a reload of the same URL commit different values. decodeParams must undo encodeParams.`,
        ],
      ]);

      router.stop();
    });

    it("a key an interceptor derives from one the decoder adds, reported beside the decoder's own", async () => {
      const { router, warnings } = validated(ROUTES);

      await router.start("/home");
      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, routeName, routeParams, routeSearch) => {
          const forwarded = next(routeName, routeParams, routeSearch);
          const { page } = forwarded.search;

          return forwarded.name === "listing" && typeof page === "number"
            ? {
                ...forwarded,
                search: { ...forwarded.search, offset: (page - 1) * 20 },
              }
            : forwarded;
        },
      );

      const state = await router.navigate("listing", {}, { q: "shoes" });

      expect(reloadOf(router, state).search).toStrictEqual({
        offset: 0,
        page: 1,
        q: "shoes",
        sort: "relevance",
      });
      expect(warnings).toStrictEqual([
        ["router", expect.stringContaining(`codec adds "page"`)],
        ["router", expect.stringContaining(`codec adds "sort"`)],
        ["router", expect.stringContaining(`codec adds "offset"`)],
      ]);

      router.stop();
    });

    it("keys an interceptor derives from each other, one of which the decoder adds", async () => {
      const { router, warnings } = validated([
        ...ROUTES,
        {
          ...LISTING,
          name: "offsetListing",
          path: "/offset-listing?q&page&sort&offset",
        },
      ]);

      await router.start("/home");
      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, routeName, routeParams, routeSearch) => {
          const forwarded = next(routeName, routeParams, routeSearch);
          const { page, offset } = forwarded.search;

          if (forwarded.name !== "offsetListing") {
            return forwarded;
          }

          if (typeof page === "number" && offset === undefined) {
            return {
              ...forwarded,
              search: { ...forwarded.search, offset: (page - 1) * 20 },
            };
          }

          return typeof offset === "number" && page === undefined
            ? {
                ...forwarded,
                search: { ...forwarded.search, page: offset / 20 + 1 },
              }
            : forwarded;
        },
      );

      const state = await router.navigate("offsetListing", {}, { q: "shoes" });

      expect(state.search).toStrictEqual({ q: "shoes" });
      expect(reloadOf(router, state).search).toStrictEqual({
        offset: 0,
        page: 1,
        q: "shoes",
        sort: "relevance",
      });
      expect(warnings).toStrictEqual([
        ["router", expect.stringContaining(`codec adds "page"`)],
        ["router", expect.stringContaining(`codec adds "sort"`)],
        ["router", expect.stringContaining(`codec adds "offset"`)],
      ]);

      router.stop();
    });

    it("keys an interceptor carries over together, which a link clears", async () => {
      const { router, warnings } = validated([...ROUTES, STAY]);

      await router.start("/home");
      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, routeName, routeParams, routeSearch) => {
          const current = router.getState();
          const linked = routeSearch ?? {};
          const dates =
            current?.name === routeName &&
            !("from" in linked) &&
            !("to" in linked)
              ? { from: current.search.from, to: current.search.to }
              : {};

          return next(routeName, routeParams, { ...dates, ...linked });
        },
      );
      await router.navigate(
        "stay",
        {},
        searchOf({
          city: "Oslo",
          from: new Date("2024-03-01T00:00:00.000Z"),
          to: new Date("2024-03-08T00:00:00.000Z"),
        }),
      );

      const state = await router.navigate(
        "stay",
        {},
        { city: "Bergen", from: undefined, to: undefined },
      );

      expect(state.search).toStrictEqual({ city: "Bergen" });
      expect(reloadOf(router, state).search).toStrictEqual({ city: "Bergen" });
      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("a params key an interceptor derives from one the decoder adds, reported beside the decoder's own", async () => {
      const { router, warnings } = validated(ROUTES);

      await router.start("/home");
      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, routeName, routeParams, routeSearch) => {
          const forwarded = next(routeName, routeParams, routeSearch);
          const { kind } = forwarded.params;

          return typeof kind === "string"
            ? {
                ...forwarded,
                params: { ...forwarded.params, label: kind.toUpperCase() },
              }
            : forwarded;
        },
      );

      const state = await router.navigate("cars", { slug: "bmw" });

      expect(reloadOf(router, state).params).toStrictEqual({
        kind: "car",
        label: "CAR",
        slug: "bmw",
      });
      expect(warnings).toStrictEqual([
        ["router", expect.stringContaining(`codec adds "kind"`)],
        ["router", expect.stringContaining(`codec adds "label"`)],
      ]);

      router.stop();
    });

    it("a key a reload adds with a value that compares equal to absence", async () => {
      const { router, warnings } = validated([
        ...ROUTES,
        {
          name: "absentList",
          path: "/absent-list?q&extra",
          decodeParams: ({ params, search }) => ({
            params,
            search: searchOf({ ...search, extra: [undefined] }),
          }),
        },
      ]);

      await router.start("/home");

      const state = await router.navigate("absentList", {}, { q: "a" });

      expect(reloadOf(router, state).search).toStrictEqual({
        extra: [undefined],
        q: "a",
      });
      expect(warnings).toStrictEqual([
        [
          "router",
          expect.stringContaining(`Route "absentList": its codec adds "extra"`),
        ],
      ]);

      router.stop();
    });

    it("a key a reload adds with a value that compares equal to absence, which an interceptor answers as `undefined`", async () => {
      const { router, warnings } = validated([
        ...ROUTES,
        {
          name: "absentList",
          path: "/absent-list?q&extra",
          decodeParams: ({ params, search }) => ({
            params,
            search: searchOf({ ...search, extra: [undefined] }),
          }),
        },
      ]);

      await router.start("/home");
      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, routeName, routeParams, routeSearch) => {
          const forwarded = next(routeName, routeParams, routeSearch);

          return forwarded.name === "absentList"
            ? {
                ...forwarded,
                search: {
                  q: forwarded.search.q,
                  extra: forwarded.search.extra,
                },
              }
            : forwarded;
        },
      );

      const state = await router.navigate("absentList", {}, { q: "a" });

      expect(state.search).toStrictEqual({ q: "a" });
      expect(warnings).toStrictEqual([
        [
          "router",
          expect.stringContaining(`Route "absentList": its codec adds "extra"`),
        ],
      ]);

      router.stop();
    });

    it("a default the decoder fills in, where an interceptor would carry another value over", async () => {
      const { router, warnings } = validated(ROUTES);

      carryLang(router);
      await router.start("/home");
      await router.navigate("shouted", {}, { q: "a", lang: "fr" });

      const state = await router.navigate(
        "defaulted",
        {},
        { q: "a", lang: undefined },
      );

      expect(state.search).toStrictEqual({ q: "a" });
      expect(reloadOf(router, state).search).toStrictEqual({
        lang: "en",
        q: "a",
      });
      expect(warnings).toStrictEqual([
        [
          "router",
          expect.stringContaining(`Route "defaulted": its codec adds "lang"`),
        ],
      ]);

      router.stop();
    });

    it("a key a decoder adds while it sorts its input in place, without touching the state", async () => {
      const { router, warnings } = await started(ROUTES);
      const tags = ["b", "a"];

      const state = await router.navigate("sortedTags", {}, { tags });

      expect(tags).toStrictEqual(["b", "a"]);
      expect(state.search.tags).toStrictEqual(["b", "a"]);
      expect(warnings).toStrictEqual([
        [
          "router",
          expect.stringContaining(
            `Route "sortedTags": its codec changes "tags"`,
          ),
        ],
        [
          "router",
          expect.stringContaining(`Route "sortedTags": its codec adds "count"`),
        ],
      ]);

      router.stop();
    });

    it("every key of a state, when a second read of its URL throws", async () => {
      let reads = 0;
      const twice: Route = {
        name: "twice",
        path: "/twice?q&tag",
        encodeParams: ({ params, search }) => ({
          params,
          search: { ...search, tag: (search.tag as unknown as Tag).text },
        }),
        decodeParams: ({ params, search }) => {
          reads++;

          if (reads === 2) {
            throw new Error("the second read of the URL");
          }

          return {
            params,
            search: {
              ...search,
              q: String(search.q).toLowerCase(),
              tag: new Tag(String(search.tag)),
            } as unknown as SearchParams,
          };
        },
      };
      const { router, warnings } = await started([HOME, twice]);

      await router.navigate(
        "twice",
        {},
        searchOf({ q: "ABC", tag: new Tag("x") }),
      );

      expect(reads).toBe(2);
      expect(warnings).toStrictEqual([
        ["router", expect.stringContaining(`changes "q" in state.search`)],
        [
          "router",
          expect.stringContaining(`Two reloads of one URL decode values`),
        ],
      ]);

      router.stop();
    });

    it("an object the decoder returns in another key order, with nothing to rebuild it", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate(
        "filtered",
        {},
        searchOf({ filter: { status: "open", owner: "me" } }),
      );

      expect(router.areStatesEqual(state, reloadOf(router, state), false)).toBe(
        false,
      );
      expect(warnings).toStrictEqual([
        [
          "router",
          expect.stringContaining(
            `changes "filter" in state.search, so a link and a reload of the same URL commit ` +
              `different values. encodeParams prints both as one piece`,
          ),
        ],
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

    it("an object rebuilt by the decoder: a plain object compares by its fields", async () => {
      const { router, warnings } = await started(ROUTES);

      await router.navigate("directions", {
        from: { lat: 1.5, lng: 2 },
        to: { lat: 3, lng: 4.25 },
      });

      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("a value exactly as fine as its piece: a Date at the day codec's midnight", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate(
        "events",
        {},
        searchOf({ from: new Date("2024-03-15T00:00:00.000Z") }),
      );

      expect(router.areStatesEqual(state, reloadOf(router, state), false)).toBe(
        true,
      );
      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("an object a forwardState interceptor reads back from its piece on a reload: a search schema's date", async () => {
      const { router, warnings } = validated(ROUTES);

      readDayBack(router);
      await router.start("/home");

      const state = await router.navigate(
        "stamped",
        {},
        searchOf({ from: new Date("2024-03-15T00:00:00.000Z") }),
      );

      expect(router.areStatesEqual(state, reloadOf(router, state), false)).toBe(
        true,
      );
      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("an object a search schema rebuilds on a reload: its key order and a default field", async () => {
      const { router, warnings } = validated(ROUTES);

      rebuildFilter(router);
      await router.start("/home");

      const state = await router.navigate(
        "filtered",
        {},
        searchOf({ filter: { status: "open", owner: "me" } }),
      );

      expect(router.areStatesEqual(state, reloadOf(router, state), false)).toBe(
        true,
      );
      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("a Date on a whole second under a decoder alone: the URL prints all of it", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate(
        "noted",
        {},
        searchOf({ at: new Date("2024-03-15T10:30:45.000Z") }),
      );

      expect(router.areStatesEqual(state, reloadOf(router, state), false)).toBe(
        true,
      );
      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("a number the URL parses back under the default formats: an object holding it", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate(
        "wrapped",
        {},
        searchOf({ page: { n: 2 } }),
      );

      expect(reloadOf(router, state).search.page).toStrictEqual({ n: 2 });
      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("a default the encoder leaves out of the URL: core merges it back", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate("firstPage", {}, { page: 1 });

      expect(state.path).toBe("/first-page");
      expect(reloadOf(router, state).search.page).toBe(1);
      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("a decoder the plugin refuses on a reload: the refusal is the report (#2896)", async () => {
      const { router, warnings } = await started(ROUTES);

      const state = await router.navigate("trimmed", {}, { q: " router " });

      expect(() => reloadOf(router, state)).toThrow(
        "Invalid routeParams: undefined",
      );
      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("a key a forwardState interceptor carries over from the state the navigation leaves", async () => {
      const { router, warnings } = validated(ROUTES);

      carryLang(router);
      await router.start("/home");
      await router.navigate("shouted", {}, { q: "a", lang: "en" });

      const state = await router.navigate(
        "shouted",
        {},
        { q: "b", lang: undefined },
      );

      expect(state.search).toStrictEqual({ q: "b" });
      // After the commit the router's reload carries nothing over.
      expect(router.areStatesEqual(state, reloadOf(router, state), false)).toBe(
        true,
      );
      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("a path a reload matches to another route is not judged", async () => {
      const { router, warnings } = await started(ITEM_ROUTES);

      const state = await router.navigate("item", { id: "draft" });

      expect(reloadOf(router, state).name).toBe("itemNew");
      expect(warnings).toStrictEqual([]);

      router.stop();
    });

    it("a state whose encoder answers a channel that is not a bag is not judged", async () => {
      const { router, warnings } = await started([
        ...ROUTES,
        {
          name: "unbagged",
          path: "/unbagged?q&extra",
          encodeParams: ({ search }) => ({
            params: [] as unknown as ParamsSearch["params"],
            search,
          }),
          decodeParams: ({ params, search }) => ({
            params,
            search: { ...search, extra: "1" },
          }),
        },
      ]);

      const state = await router.navigate("unbagged", {}, { q: "x" });

      expect(reloadOf(router, state).search).toStrictEqual({
        extra: "1",
        q: "x",
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

    it("with one reload per state, and one more read of the path for the keys that need it", async () => {
      const exact = searchOf({
        from: new Date("2024-03-15T00:00:00.000Z"),
        to: new Date("2024-03-16T00:00:00.000Z"),
      });
      const finer = searchOf({
        from: new Date("2024-03-15T10:00:00.000Z"),
        to: new Date("2024-03-16T10:00:00.000Z"),
      });
      const bare = await forwardStateRuns(logged(ROUTES), "span", exact);
      const judged = validated(ROUTES);

      expect(bare).toBeGreaterThan(0);
      await expect(
        forwardStateRuns(logged(ROUTES), "span", finer),
      ).resolves.toBe(bare);
      await expect(
        forwardStateRuns(validated(ROUTES), "span", exact),
      ).resolves.toBe(bare + 1);
      await expect(forwardStateRuns(judged, "span", finer)).resolves.toBe(
        bare + 2,
      );
      expect(judged.warnings).toStrictEqual([
        ["router", expect.stringContaining(`changes "from"`)],
        ["router", expect.stringContaining(`changes "to"`)],
      ]);
    });

    it("and the forward chain once more when a reload adds keys", async () => {
      const shoes = { q: "shoes" };
      const bare = await forwardStateRuns(logged(ROUTES), "listing", shoes);
      const judged = validated(ROUTES);

      await expect(forwardStateRuns(judged, "listing", shoes)).resolves.toBe(
        bare + 2,
      );
      expect(judged.warnings).toStrictEqual([
        ["router", expect.stringContaining(`adds "page"`)],
        ["router", expect.stringContaining(`adds "sort"`)],
      ]);
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
