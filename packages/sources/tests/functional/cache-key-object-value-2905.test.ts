import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { createActiveRouteSource } from "../../src";

import type { Route, SearchParams } from "@real-router/core";
import type { ParamsSearch } from "@real-router/core/types";

/**
 * Two values core tells apart never share a cache slot (#2905).
 *
 * The cache key spells a value as core compares it: a plain object by its own
 * keys in their own order, an array element by element, and a `Date` by its
 * time, apart from every string. Core compares any other object by its
 * `toString`, or by identity, so the key refuses it, and a value JSON drops or
 * spells `null` too: spelled by its fields — `{}` for a `Temporal` value or a
 * class holding only `#private` fields — two values core tells apart would
 * share a slot, and the source created first would answer for both.
 */

/** A value class that keeps its state in a `#private` field. */
class Slug {
  readonly #text: string;

  constructor(text: string) {
    this.#text = text;
  }

  toString(): string {
    return this.#text;
  }
}

/** A value class whose state is an own field, with no `toString` of its own. */
class Box {
  constructor(readonly text: string) {}
}

/** A value class whose state is an own field, printed by its own `toString`. */
class Label {
  constructor(readonly text: string) {}

  toString(): string {
    return this.text;
  }
}

/** One kind of value a codec decodes, and the URL piece it prints. */
interface Kind {
  readonly make: (text: string) => object;
  readonly print: (value: object) => string;
}

const KINDS: [string, Kind][] = [
  [
    "a Temporal.PlainDate",
    { make: (text) => Temporal.PlainDate.from(text), print: String },
  ],
  [
    "a class holding only #private fields",
    { make: (text) => new Slug(text), print: String },
  ],
  [
    "a Date, which the key spells by its time (control)",
    {
      make: (text) => new Date(`${text}T00:00:00.000Z`),
      print: (value) => (value as Date).toISOString().slice(0, 10),
    },
  ],
  [
    "a plain object, which the key spells by its fields (control)",
    {
      make: (text) => ({ text }),
      print: (value) => (value as { text: string }).text,
    },
  ],
];

/** The two creation orders: the first source created must not decide. */
const ORDERS = [
  ["2024-03-15", "2024-03-16"],
  ["2024-03-16", "2024-03-15"],
];

/** What core answers, and so what every source must answer. */
const EXPECTED = { "2024-03-15": true, "2024-03-16": false };

function routesOf(kind: Kind): Route[] {
  return [
    { name: "home", path: "/home" },
    {
      name: "day",
      path: "/day?d",
      encodeParams: ({ params, search }: ParamsSearch): ParamsSearch => ({
        params,
        search: {
          ...search,
          d:
            typeof search.d === "object" && search.d !== null
              ? kind.print(search.d)
              : search.d,
        },
      }),
      decodeParams: ({ params, search }: ParamsSearch): ParamsSearch => ({
        params,
        search: {
          ...search,
          d: typeof search.d === "string" ? kind.make(search.d) : search.d,
        } as SearchParams,
      }),
    },
  ];
}

/** A query bag holding a value the declared types do not admit. */
const searchOf = (value: unknown): SearchParams =>
  ({ d: value }) as unknown as SearchParams;

/** A JSON codec: an object printed as its JSON, read back by `JSON.parse`. */
const JSON_KIND: Kind = {
  make: (text) => JSON.parse(text) as object,
  print: (value) => JSON.stringify(value),
};

/** The day codec of {@link KINDS}. */
const DAY_KIND: Kind = {
  make: (text) => new Date(`${text}T00:00:00.000Z`),
  print: (value) => (value as Date).toISOString().slice(0, 10),
};

/**
 * Two link values whose fields JSON spells alike while core tells them apart,
 * on `/day?d=<piece>`: `[kind the codec decodes, the piece, two links, core's
 * answers]`. A link is built from the state the router committed.
 */
type Links = Readonly<Record<string, (committed: object) => unknown>>;

const SPELLED_ALIKE: [
  string,
  Kind,
  string,
  Links,
  Readonly<Record<string, boolean>>,
][] = [
  [
    "a class core compares by identity: the state's own instance and a fresh copy",
    { make: (text) => new Box(text), print: (value) => (value as Box).text },
    "2024-03-15",
    { own: (committed) => committed, fresh: () => new Box("2024-03-15") },
    { own: true, fresh: false },
  ],
  [
    "a class with a toString of its own and a plain object of its fields",
    { make: (text) => new Label(text), print: String },
    "2024-03-15",
    {
      label: () => new Label("2024-03-15"),
      plain: () => ({ text: "2024-03-15" }),
    },
    { label: true, plain: false },
  ],
  [
    "a plain object and its keys in another order",
    JSON_KIND,
    '{"a":1,"b":2}',
    { same: () => ({ a: 1, b: 2 }), reordered: () => ({ b: 2, a: 1 }) },
    { same: true, reordered: false },
  ],
  [
    "a Date and its ISO string",
    DAY_KIND,
    "2024-03-15",
    {
      date: () => new Date("2024-03-15T00:00:00.000Z"),
      iso: () => "2024-03-15T00:00:00.000Z",
    },
    { date: true, iso: false },
  ],
  [
    "a field holding null and one holding NaN",
    JSON_KIND,
    '{"x":null}',
    { null: () => ({ x: null }), nan: () => ({ x: Number.NaN }) },
    { null: true, nan: false },
  ],
  [
    "a plain object and one beside a function field JSON drops",
    JSON_KIND,
    '{"k":"a"}',
    { plain: () => ({ k: "a" }), callback: () => ({ k: "a", f: () => 1 }) },
    { plain: true, callback: false },
  ],
];

// The slow path — the fast name-only selector never reaches `isActiveRoute`.
const OPTS = { ignoreQueryParams: false };

describe("active-route source cache key: an object value (#2905)", () => {
  it("registers every row of its tables", () => {
    expect(KINDS).toHaveLength(4);
    expect(ORDERS).toHaveLength(2);
    expect(SPELLED_ALIKE).toHaveLength(6);
  });

  it.each(SPELLED_ALIKE)(
    "two links whose fields spell alike get core's two answers, in either creation order: %s",
    async (_, kind, piece, links, expected) => {
      const entries = Object.entries(links);

      for (const order of [entries, entries.toReversed()]) {
        const router = createRouter(routesOf(kind));

        await router.start(`/day?d=${encodeURIComponent(piece)}`);

        const committed = router.getState()?.search.d as object;
        const answer = (
          ask: (value: unknown) => boolean,
        ): Record<string, boolean> =>
          Object.fromEntries(
            order.map(([name, link]) => [name, ask(link(committed))]),
          );

        expect(
          answer((value) =>
            router.isActiveRoute(
              "day",
              undefined,
              searchOf(value),
              false,
              false,
            ),
          ),
        ).toStrictEqual(expected);
        expect(
          answer((value) =>
            createActiveRouteSource(
              router,
              "day",
              undefined,
              searchOf(value),
              OPTS,
            ).getSnapshot(),
          ),
        ).toStrictEqual(expected);

        router.dispose();
      }
    },
  );

  it.each(KINDS)(
    "two links to two values core tells apart get core's two answers, in either creation order: %s",
    async (_, kind) => {
      for (const order of ORDERS) {
        const router = createRouter(routesOf(kind));

        await router.start("/day?d=2024-03-15");

        const fromSources = Object.fromEntries(
          order.map((text) => [
            text,
            createActiveRouteSource(
              router,
              "day",
              undefined,
              searchOf(kind.make(text)),
              OPTS,
            ).getSnapshot(),
          ]),
        );
        const fromCore = Object.fromEntries(
          order.map((text) => [
            text,
            router.isActiveRoute(
              "day",
              undefined,
              searchOf(kind.make(text)),
              false,
              false,
            ),
          ]),
        );

        expect(fromCore).toStrictEqual(EXPECTED);
        expect(fromSources).toStrictEqual(EXPECTED);

        router.dispose();
      }
    },
  );
});
