import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { areParamValuesEqual } from "@real-router/core/validation";

import {
  CONTAINER_SHAPES,
  countingBag,
  throwingBag,
} from "../../helpers/hostileBags";

import type {
  Params,
  Route,
  Router,
  SearchParams,
  State,
} from "@real-router/core";
import type { ParamsSearch } from "@real-router/core/types";

/**
 * An object value compares by a key (#2905, the rule #2894 decided): a `Date`
 * by `getTime()`, a plain object by `JSON.stringify` where JSON spells each of
 * its fields, any other object by the string its `toString` returns. An
 * object with no key compares by identity in `areParamValuesEqual`
 * and counts as unchanged in the transition path; an object never equals a
 * scalar.
 *
 * A codec decodes a fresh object on every read of a URL, so the cells below
 * build their values fresh on both sides.
 */

/** UTC midnight of a day in March 2024, as a day codec decodes it. */
const day = (date: number): Date => new Date(Date.UTC(2024, 2, date));

/** A value class with a `toString` of its own, the shape of `Temporal.PlainDate`. */
class Day {
  constructor(readonly iso: string) {}

  toString(): string {
    return this.iso;
  }
}

/** A class with no `toString` of its own: its instances have no key. */
class Box {
  constructor(readonly value: string) {}
}

/** A subclass of `Date`, the shape of `TZDate` in `@date-fns/tz`. */
class ZonedDate extends Date {}

/** How a codec prints one kind of value into a URL piece, and reads it back. */
interface Piece {
  readonly print: (value: unknown) => unknown;
  readonly parse: (text: string) => unknown;
}

const DATE_PIECE: Piece = {
  print: (value) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : value,
  parse: (text) => new Date(text),
};

const JSON_PIECE: Piece = {
  print: (value) =>
    typeof value === "object" && value !== null ? JSON.stringify(value) : value,
  parse: (text) => JSON.parse(text) as unknown,
};

const DAY_PIECE: Piece = {
  print: (value) => (value instanceof Day ? value.iso : value),
  parse: (text) => new Day(text),
};

const BOX_PIECE: Piece = {
  print: (value) => (value instanceof Box ? value.value : value),
  parse: (text) => new Box(text),
};

/** A `Box` by its value and a `Date` by its day: one key, with a key or none. */
const BOX_OR_DATE_PIECE: Piece = {
  print: (value) => DATE_PIECE.print(BOX_PIECE.print(value)),
  parse: (text) => new Box(text),
};

/** A filter holding a `Set`, printed as its members: JSON spells a `Set` `{}`. */
const SET_PIECE: Piece = {
  print: (value) =>
    typeof value === "object" && value !== null
      ? [...(value as { tags: Set<string> }).tags].join("~")
      : value,
  parse: (text) => ({ tags: new Set(text.split("~")) }),
};

/** A value, or each element of an array. */
const each = (value: unknown, map: (element: unknown) => unknown): unknown =>
  Array.isArray(value) ? value.map((element) => map(element)) : map(value);

const parsed =
  (piece: Piece) =>
  (value: unknown): unknown =>
    typeof value === "string" ? piece.parse(value) : value;

type Codec = Pick<Route, "encodeParams" | "decodeParams">;

/** A codec that prints `key` of the query with `piece`, an exact inverse pair. */
function searchCodec(key: string, piece: Piece): Codec {
  return {
    encodeParams: ({ params, search }: ParamsSearch): ParamsSearch => ({
      params,
      search: {
        ...search,
        [key]: each(search[key], piece.print),
      } as SearchParams,
    }),
    decodeParams: ({ params, search }: ParamsSearch): ParamsSearch => ({
      params,
      search: {
        ...search,
        [key]: each(search[key], parsed(piece)),
      } as SearchParams,
    }),
  };
}

/** The same for a path slot. */
function pathCodec(key: string, piece: Piece): Codec {
  return {
    encodeParams: ({ params, search }: ParamsSearch): ParamsSearch => ({
      params: { ...params, [key]: piece.print(params[key]) } as Params,
      search,
    }),
    decodeParams: ({ params, search }: ParamsSearch): ParamsSearch => ({
      params: { ...params, [key]: parsed(piece)(params[key]) } as Params,
      search,
    }),
  };
}

/** A bag holding values the declared types do not admit. */
const search = (bag: Record<string, unknown>): SearchParams =>
  bag as SearchParams;
const params = (bag: Record<string, unknown>): Params => bag as Params;

const filterUrl = (filter: object): string =>
  `/list?filter=${encodeURIComponent(JSON.stringify(filter))}`;

const ROUTES: Route[] = [
  { name: "home", path: "/home" },
  { name: "events", path: "/events?from", ...searchCodec("from", DATE_PIECE) },
  { name: "day", path: "/day/:day", ...pathCodec("day", DATE_PIECE) },
  { name: "list", path: "/list?filter", ...searchCodec("filter", JSON_PIECE) },
  { name: "agenda", path: "/agenda?when", ...searchCodec("when", DAY_PIECE) },
  { name: "tagset", path: "/tagset?f", ...searchCodec("f", SET_PIECE) },
  {
    name: "shop",
    path: "/shop?from&filter",
    children: [
      { name: "dated", path: "/dated", ...searchCodec("from", DATE_PIECE) },
      { name: "listed", path: "/listed", ...searchCodec("filter", JSON_PIECE) },
    ],
  },
];

/** A URL, and the route, path bag and query bag an intent writes for it. */
type Door = [string, string, string, Params, SearchParams];

const DOORS: Door[] = [
  [
    "a Date in the query",
    "/events?from=2024-03-15",
    "events",
    {},
    search({ from: day(15) }),
  ],
  [
    "a Date in a path slot",
    "/day/2024-03-15",
    "day",
    params({ day: day(15) }),
    {},
  ],
  [
    "a plain object in the query",
    filterUrl({ status: "active" }),
    "list",
    {},
    search({ filter: { status: "active" } }),
  ],
  [
    "an object with a toString of its own in the query",
    "/agenda?when=2024-03-15",
    "agenda",
    {},
    search({ when: new Day("2024-03-15") }),
  ],
];

/** The same doors with a value the URL does not hold. */
const OTHER_VALUES: Door[] = [
  [
    "a Date in the query",
    "/events?from=2024-03-15",
    "events",
    {},
    search({ from: day(16) }),
  ],
  [
    "a Date in a path slot",
    "/day/2024-03-15",
    "day",
    params({ day: day(16) }),
    {},
  ],
  [
    "a plain object in the query",
    filterUrl({ status: "active" }),
    "list",
    {},
    search({ filter: { status: "archived" } }),
  ],
  [
    "an object with a toString of its own in the query",
    "/agenda?when=2024-03-15",
    "agenda",
    {},
    search({ when: new Day("2024-03-16") }),
  ],
];

/**
 * A descendant's URL, the ancestor a link names, a value equal to the one the
 * URL decoded and another: the arm of `isActiveRoute` a link to an ancestor
 * takes.
 */
type AncestorLink = [string, string, string, SearchParams, SearchParams];

const ANCESTOR_LINKS: AncestorLink[] = [
  [
    "a Date in the query",
    "/shop/dated?from=2024-03-15",
    "shop",
    search({ from: day(15) }),
    search({ from: day(16) }),
  ],
  [
    "a plain object in the query",
    `/shop/listed?filter=${encodeURIComponent(JSON.stringify({ status: "active" }))}`,
    "shop",
    search({ filter: { status: "active" } }),
    search({ filter: { status: "archived" } }),
  ],
];

describe("one URL is one state when a codec decodes an object (#2905)", () => {
  let router: Router | undefined;

  afterEach(() => {
    router?.dispose();
    router = undefined;
  });

  async function startAt(path: string): Promise<Router> {
    router = createRouter(ROUTES);
    await router.start(path);

    return router;
  }

  it("registers every row of its tables", () => {
    expect(DOORS).toHaveLength(4);
    expect(OTHER_VALUES).toHaveLength(4);
    expect(OTHER_VALUES.map(([label]) => label)).toStrictEqual(
      DOORS.map(([label]) => label),
    );
    expect(ANCESTOR_LINKS).toHaveLength(2);
  });

  it.each(DOORS)(
    "isActiveRoute matches a fresh value equal to the one the URL decoded, under both strict polarities: %s",
    async (_, path, name, pathBag, queryBag) => {
      const r = await startAt(path);

      expect(r.isActiveRoute(name, pathBag, queryBag, true, false)).toBe(true);
      expect(r.isActiveRoute(name, pathBag, queryBag, false, false)).toBe(true);
    },
  );

  it.each(ANCESTOR_LINKS)(
    "an ancestor link matches a fresh value equal to the one its descendant's URL decoded, and no other: %s",
    async (_, path, ancestor, equal, other) => {
      const r = await startAt(path);

      expect(r.isActiveRoute(ancestor, {}, equal, false, false)).toBe(true);
      expect(r.isActiveRoute(ancestor, {}, other, false, false)).toBe(false);
    },
  );

  it("an object JSON cannot spell in full has no key: a link to another Set filter is not active", async () => {
    const r = await startAt("/tagset?f=a");

    expect(
      r.isActiveRoute(
        "tagset",
        {},
        search({ f: { tags: new Set(["b"]) } }),
        true,
        false,
      ),
    ).toBe(false);
  });

  it.each(OTHER_VALUES)(
    "isActiveRoute does not match a value the URL does not hold, under both strict polarities: %s",
    async (_, path, name, pathBag, queryBag) => {
      const r = await startAt(path);

      expect(r.isActiveRoute(name, pathBag, queryBag, true, false)).toBe(false);
      expect(r.isActiveRoute(name, pathBag, queryBag, false, false)).toBe(
        false,
      );
    },
  );

  it.each(DOORS)(
    "two matchPath of one URL compare equal: %s",
    (_, path, name) => {
      const r = createRouter(ROUTES);
      const api = getPluginApi(r);
      const first = api.matchPath(path);
      const second = api.matchPath(path);

      expect(first?.name).toBe(name);
      expect(r.areStatesEqual(first, second, false)).toBe(true);
    },
  );

  it.each(DOORS)(
    "a state built from an intent equals the state its own path matches back to: %s",
    (_, _path, name, pathBag, queryBag) => {
      const r = createRouter(ROUTES);
      const api = getPluginApi(r);
      const fromIntent = api.makeState(name, pathBag, queryBag);
      const fromUrl = api.matchPath(fromIntent.path);

      expect(fromUrl?.name).toBe(name);
      expect(r.areStatesEqual(fromIntent, fromUrl, false)).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// The transition path
// ---------------------------------------------------------------------------

let log: string[];

const guard = (label: string) => () => (): boolean => {
  log.push(label);

  return true;
};

/** `p` declares the key, its leaf `p.c` declares `?page` and prints the key. */
function treeOf(parentPath: string, codec: Codec): Route[] {
  return [
    { name: "home", path: "/home" },
    {
      name: "p",
      path: parentPath,
      canActivate: guard("activate p"),
      canDeactivate: guard("deactivate p"),
      children: [
        {
          name: "c",
          path: "/c?page",
          canActivate: guard("activate p.c"),
          canDeactivate: guard("deactivate p.c"),
          ...codec,
        },
      ],
    },
  ];
}

/** The parent's path bag and query bag of one navigation, built fresh per call. */
type Values = () => [Params, SearchParams];

/** Columns: label, parent path, codec, the first values, the second values. */
type Change = [string, string, Codec, Values, Values];

/** The key the parent declares changes, and the URL prints the change. */
const KEY_CHANGES: Change[] = [
  [
    "a Date in the query moves a day",
    "/p?from",
    searchCodec("from", DATE_PIECE),
    () => [{}, search({ from: day(15) })],
    () => [{}, search({ from: day(16) })],
  ],
  [
    "a Date in a path slot moves a day",
    "/p/:day",
    pathCodec("day", DATE_PIECE),
    () => [params({ day: day(15) }), {}],
    () => [params({ day: day(16) }), {}],
  ],
  [
    "a Date inside an array of the same length moves a day",
    "/p?range",
    searchCodec("range", DATE_PIECE),
    () => [{}, search({ range: [day(1), day(15)] })],
    () => [{}, search({ range: [day(1), day(16)] })],
  ],
  [
    "a plain object changes a field",
    "/p?filter",
    searchCodec("filter", JSON_PIECE),
    () => [{}, search({ filter: { status: "active" } })],
    () => [{}, search({ filter: { status: "archived" } })],
  ],
  [
    "an object with a toString of its own changes",
    "/p?when",
    searchCodec("when", DAY_PIECE),
    () => [{}, search({ when: new Day("2024-03-15") })],
    () => [{}, search({ when: new Day("2024-03-16") })],
  ],
  [
    "an object with no key replaces a null",
    "/p?box",
    searchCodec("box", BOX_PIECE),
    () => [{}, search({ box: null })],
    () => [{}, search({ box: new Box("a") })],
  ],
  [
    "a null replaces an object with no key",
    "/p?box",
    searchCodec("box", BOX_PIECE),
    () => [{}, search({ box: new Box("a") })],
    () => [{}, search({ box: null })],
  ],
  [
    "a Date replaces an object with no key",
    "/p?box",
    searchCodec("box", BOX_OR_DATE_PIECE),
    () => [{}, search({ box: new Box("a") })],
    () => [{}, search({ box: day(15) })],
  ],
  [
    "an object with no key replaces a Date",
    "/p?box",
    searchCodec("box", BOX_OR_DATE_PIECE),
    () => [{}, search({ box: day(15) })],
    () => [{}, search({ box: new Box("a") })],
  ],
];

/** The parent's value is a fresh object with the same key: no change. */
const KEY_KEPT: Change[] = [
  [
    "a fresh Date of the same instant in the query",
    "/p?from",
    searchCodec("from", DATE_PIECE),
    () => [{}, search({ from: day(15) })],
    () => [{}, search({ from: day(15) })],
  ],
  [
    "a fresh Date of the same instant in a path slot",
    "/p/:day",
    pathCodec("day", DATE_PIECE),
    () => [params({ day: day(15) }), {}],
    () => [params({ day: day(15) }), {}],
  ],
  [
    "a fresh copy of a plain object",
    "/p?filter",
    searchCodec("filter", JSON_PIECE),
    () => [{}, search({ filter: { status: "active" } })],
    () => [{}, search({ filter: { status: "active" } })],
  ],
  [
    "a fresh object whose own toString answers the same",
    "/p?when",
    searchCodec("when", DAY_PIECE),
    () => [{}, search({ when: new Day("2024-03-15") })],
    () => [{}, search({ when: new Day("2024-03-15") })],
  ],
  [
    "an object with no key, even one the URL prints differently",
    "/p?box",
    searchCodec("box", BOX_PIECE),
    () => [{}, search({ box: new Box("a") })],
    () => [{}, search({ box: new Box("b") })],
  ],
];

function segmentsOf(state: State): Record<string, unknown> {
  const { deactivated, activated, intersection } = state.transition.segments;

  return {
    deactivated: [...deactivated],
    activated: [...activated],
    intersection,
  };
}

describe("a segment re-enters when an object it declares changes its key (#2905)", () => {
  let router: Router | undefined;

  beforeEach(() => {
    log = [];
  });

  afterEach(() => {
    router?.dispose();
    router = undefined;
  });

  /** Navigates to `p.c` with the first values, then with the second ones. */
  async function navigateTwice(
    parentPath: string,
    codec: Codec,
    first: Values,
    second: Values,
    secondPage: string,
  ): Promise<State> {
    router = createRouter(treeOf(parentPath, codec));
    await router.start("/home");

    const [firstParams, firstSearch] = first();

    await router.navigate("p.c", firstParams, { ...firstSearch, page: "1" });
    log = [];

    const [secondParams, secondSearch] = second();

    return router.navigate("p.c", secondParams, {
      ...secondSearch,
      page: secondPage,
    });
  }

  it("registers every row of its tables", () => {
    expect(KEY_CHANGES).toHaveLength(9);
    expect(KEY_KEPT).toHaveLength(5);
  });

  it.each(KEY_CHANGES)(
    "re-enters the parent, and runs its guards, when %s",
    async (_, parentPath, codec, first, second) => {
      const to = await navigateTwice(parentPath, codec, first, second, "1");

      expect(segmentsOf(to)).toStrictEqual({
        deactivated: ["p.c", "p"],
        activated: ["p", "p.c"],
        intersection: "",
      });
      expect(log).toStrictEqual([
        "deactivate p.c",
        "deactivate p",
        "activate p",
        "activate p.c",
      ]);
    },
  );

  it.each(KEY_KEPT)(
    "keeps the parent when only the leaf changes and the parent holds %s",
    async (_, parentPath, codec, first, second) => {
      const to = await navigateTwice(parentPath, codec, first, second, "2");

      expect(segmentsOf(to)).toStrictEqual({
        deactivated: ["p.c"],
        activated: ["p.c"],
        intersection: "p",
      });
      expect(log).toStrictEqual(["deactivate p.c", "activate p.c"]);
    },
  );
});

// ---------------------------------------------------------------------------
// The rule itself, through the published comparator
// ---------------------------------------------------------------------------

/** A null-prototype object. */
const bare = (status: string): object =>
  Object.assign(Object.create(null) as object, { status });

/** A class whose `toString` answers a default tag, as an inherited one would. */
class Tagged {
  toString(): string {
    return "[object Tagged]";
  }
}

/** A class whose `toString` answers something other than a string. */
class Numeric {
  toString(): string {
    return 7 as unknown as string;
  }
}

/** One `String` object, which a string-shaped key read would take as a key. */
const SHARED_TEXT = new Object("shared") as string;

/** A class whose `toString` answers that one object for every instance. */
class Wrapped {
  toString(): string {
    return SHARED_TEXT;
  }
}

class Boom {
  toString(): string {
    throw new Error("boom");
  }
}

/** A class whose `toString` answers a text a default tag only begins like. */
class Objection {
  constructor(readonly text: string) {}

  toString(): string {
    return `[objection ${this.text}]`;
  }
}

function cycle(): object {
  const value: Record<string, unknown> = {};

  value.self = value;

  return value;
}

/** Two values a codec could hand back for one URL. */
type Pair = [string, unknown, unknown];

const EQUAL_PAIRS: Pair[] = [
  ["a Date and a fresh Date of the same instant", day(15), day(15)],
  [
    "a Date subclass and a Date of the same instant",
    new ZonedDate(Date.UTC(2024, 2, 15)),
    day(15),
  ],
  ["two Dates that hold no time", new Date(Number.NaN), new Date(Number.NaN)],
  ["a plain object and a fresh copy", { status: "a" }, { status: "a" }],
  [
    "a plain object holding an array, which JSON spells in full, and a fresh copy",
    { tags: ["a", "b"] },
    { tags: ["a", "b"] },
  ],
  [
    "a null-prototype object and a plain object of the same JSON",
    bare("a"),
    { status: "a" },
  ],
  [
    "an object with a toString of its own and a fresh one",
    new Day("2024-03-15"),
    new Day("2024-03-15"),
  ],
  ["an array of Dates and fresh copies", [day(1), day(2)], [day(1), day(2)]],
  ["a one-element array of a Date and a bare copy", [day(1)], day(1)],
  [
    "a Temporal.PlainDate and a fresh one of the same day",
    Temporal.PlainDate.from("2024-03-15"),
    Temporal.PlainDate.from("2024-03-15"),
  ],
  [
    "a plain object holding a Date, which JSON spells by toJSON, and a fresh copy",
    { from: day(15) },
    { from: day(15) },
  ],
  [
    "a toString that answers a text a default tag only begins like",
    new Objection("a"),
    new Objection("a"),
  ],
  [
    "a plain object with a field holding undefined and one without it, which JSON leaves alike",
    { status: "a", page: undefined },
    { status: "a" },
  ],
  [
    "a plain object holding undefined in an array and one holding null, which JSON spells alike",
    { tags: [undefined] },
    { tags: [null] },
  ],
  [
    "a plain object holding -0 and one holding 0, which JSON spells alike",
    { page: -0 },
    { page: 0 },
  ],
];

const UNEQUAL_PAIRS: Pair[] = [
  ["two Dates a millisecond apart", new Date(0), new Date(1)],
  [
    "two Temporal.PlainDates a day apart",
    Temporal.PlainDate.from("2024-03-15"),
    Temporal.PlainDate.from("2024-03-16"),
  ],
  [
    "two instances of a Date subclass a millisecond apart",
    new ZonedDate(0),
    new ZonedDate(1),
  ],
  ["two plain objects that differ", { status: "a" }, { status: "b" }],
  [
    "two objects whose own toString differs",
    new Day("2024-03-15"),
    new Day("2024-03-16"),
  ],
  ["a Date and a plain object", new Date(0), {}],
  [
    "a Date and an object whose toString answers its time",
    new Date(0),
    new Day("0"),
  ],
  [
    "a plain object and an object whose toString answers its JSON",
    { status: "a" },
    new Day('{"status":"a"}'),
  ],
  [
    "a Date and a plain object whose toJSON answers its time",
    new Date(0),
    { toJSON: (): number => 0 },
  ],
];

/** An object and a scalar that spells what its key is built from. */
const AGAINST_SCALARS: Pair[] = [
  ["a Date and the text of its time", new Date(0), "0"],
  ["a plain object and its JSON", { status: "a" }, '{"status":"a"}'],
  ["an object and the text its own toString returns", new Day("x"), "x"],
];

/** Objects with no key, each built fresh per call. */
const NO_KEY: [string, () => object][] = [
  ["a class with no toString of its own", () => new Box("a")],
  [
    "a toString that cannot be called: no toString on the chain at all",
    () => Object.create(Object.create(null) as object) as object,
  ],
  ["a toString that answers a default tag", () => new Tagged()],
  ["a toString that answers no string", () => new Numeric()],
  ["a toString that answers a String object", () => new Wrapped()],
  ["a toString that throws", () => new Boom()],
  ["a plain object JSON cannot print: a BigInt", () => ({ n: 1n })],
  ["a plain object JSON cannot print: a cycle", cycle],
  [
    "a plain object holding a field JSON spells {}: a Set",
    () => ({ tags: new Set(["a"]) }),
  ],
  [
    "a plain object holding a field JSON spells null: NaN",
    () => ({ n: Number.NaN }),
  ],
  [
    "a plain object holding a field JSON drops: a function",
    () => ({ f: (): number => 1 }),
  ],
  [
    "a plain object holding a field JSON drops: a symbol",
    () => ({ s: Symbol("a") }),
  ],
  [
    "a plain object holding a field JSON spells by its own fields: a class instance",
    () => ({ box: new Box("a") }),
  ],
  [
    "a plain object whose toJSON answers nothing",
    () => ({ toJSON: (): undefined => undefined }),
  ],
  [
    "an object whose prototype read throws",
    () =>
      new Proxy(
        {},
        {
          getPrototypeOf(): never {
            throw new Error("trap");
          },
        },
      ),
  ],
  [
    "an object on Date.prototype that holds no date",
    () => Object.create(Date.prototype) as object,
  ],
];

describe("areParamValuesEqual: the key an object value compares by (#2905)", () => {
  it("registers every row of its tables", () => {
    expect(EQUAL_PAIRS).toHaveLength(15);
    expect(UNEQUAL_PAIRS).toHaveLength(9);
    expect(AGAINST_SCALARS).toHaveLength(3);
    expect(NO_KEY).toHaveLength(16);
  });

  it.each(EQUAL_PAIRS)("compares equal: %s", (_, left, right) => {
    expect(areParamValuesEqual(left, right)).toBe(true);
    expect(areParamValuesEqual(right, left)).toBe(true);
  });

  it.each(UNEQUAL_PAIRS)("compares unequal: %s", (_, left, right) => {
    expect(areParamValuesEqual(left, right)).toBe(false);
    expect(areParamValuesEqual(right, left)).toBe(false);
  });

  it.each(AGAINST_SCALARS)(
    "an object never equals a scalar: %s",
    (_, object, scalar) => {
      expect(areParamValuesEqual(object, scalar)).toBe(false);
      expect(areParamValuesEqual(scalar, object)).toBe(false);
    },
  );

  it.each(NO_KEY)(
    "an object with no key compares by identity, and nothing throws: %s",
    (_, make) => {
      const value = make();

      expect(areParamValuesEqual(value, make())).toBe(false);
      expect(areParamValuesEqual(value, value)).toBe(true);
    },
  );
});

describe("the key reads intrinsics captured when core loads (#2905)", () => {
  it("two Dates a millisecond apart stay apart while the global Date is re-pointed at another class", () => {
    const [left, right] = [new Date(0), new Date(1)];

    // Read live, `instanceof` would miss both, and `Date.prototype.toString`,
    // which prints no milliseconds, would equate them.
    vi.stubGlobal("Date", Temporal.PlainDate);

    try {
      expect(areParamValuesEqual(left, right)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("two Dates a day apart stay apart while Date.prototype.getTime is re-pointed", () => {
    const getTime = vi.spyOn(Date.prototype, "getTime").mockReturnValue(0);

    try {
      expect(areParamValuesEqual(day(15), day(16))).toBe(false);
    } finally {
      getTime.mockRestore();
    }
  });

  it("two plain objects that differ stay apart while JSON.stringify is re-pointed", () => {
    const stringify = vi.spyOn(JSON, "stringify").mockReturnValue("same");

    try {
      expect(areParamValuesEqual({ status: "a" }, { status: "b" })).toBe(false);
    } finally {
      stringify.mockRestore();
    }
  });
});

/** The container shapes whose own enumerable fields are the source's, and nothing else. */
const SPELLED_AS_SOURCE = new Set([
  "own enumerable (control)",
  "pass-through Proxy (a reactive store)",
  "null-prototype",
]);

describe("the key reads a value the way core reads a caller's bag (#2905)", () => {
  const filter = { status: "active" };

  it("registers every shape", () => {
    expect(CONTAINER_SHAPES).toHaveLength(6);
    expect(
      CONTAINER_SHAPES.filter(([label]) => SPELLED_AS_SOURCE.has(label)),
    ).toHaveLength(3);
  });

  it.each(CONTAINER_SHAPES)(
    "%s: equal to itself, and to a fresh copy only when its own enumerable fields are the copy's",
    (label, wrap) => {
      const value = wrap({ ...filter });

      expect(areParamValuesEqual(value, value)).toBe(true);
      expect(areParamValuesEqual(value, { ...filter })).toBe(
        SPELLED_AS_SOURCE.has(label),
      );
    },
  );

  it("reads each field of an accessor-backed value once per comparison", () => {
    const { bag, reads } = countingBag({ ...filter });

    expect(areParamValuesEqual(bag, { ...filter })).toBe(true);
    expect(reads).toStrictEqual({ status: 1 });
  });

  it("a field read that throws leaves the value without a key, and nothing throws", () => {
    const value = throwingBag({ ...filter }, new Error("a store refused"));

    expect(areParamValuesEqual(value, { ...filter })).toBe(false);
    expect(areParamValuesEqual(value, value)).toBe(true);
  });
});
