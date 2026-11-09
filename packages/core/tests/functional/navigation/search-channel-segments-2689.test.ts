import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import {
  CONTAINER_SHAPES,
  countingBag,
  throwingBag,
} from "../../helpers/hostileBags";

import type {
  Options,
  Route,
  Router,
  SearchParams,
  SearchParamValue,
  State,
} from "@real-router/core";
import type { ParamsSearch } from "@real-router/core/types";

/**
 * A segment's declared QUERY params are part of its identity, as its path
 * params are (#2689): a navigation that changes only `state.search` re-enters
 * the segment that declares the changed key, so its guards run, its node updates
 * and `transition.segments` names it. The cells below reach that one decision
 * through its doors; the controls pin what must NOT count as a change.
 */

let router: Router | undefined;
let log: string[];

/**
 * A `Date` as a codec or a search schema hands it back — an object value,
 * which the declared `SearchParamValue` type does not admit. Every call is a
 * fresh object.
 */
const dateValue = (day = 1): SearchParamValue =>
  new Date(Date.UTC(2024, 0, day)) as unknown as SearchParamValue;

/** An array of fresh `Date`s, one per day. */
const dates = (...days: number[]): SearchParamValue =>
  days.map((day) => dateValue(day)) as unknown as SearchParamValue;

const guard =
  (label: string, verdict: (toState: State) => boolean = () => true) =>
  () =>
  (toState: State): boolean => {
    log.push(label);

    return verdict(toState);
  };

function ordersTree(): Route[] {
  return [
    {
      name: "orders",
      path: "/orders?status&tags",
      canActivate: guard("activate orders"),
      canDeactivate: guard("deactivate orders"),
      children: [
        {
          name: "list",
          path: "/list?page",
          canActivate: guard(
            "activate orders.list",
            (toState) => Number(toState.search.page) <= 5,
          ),
          canDeactivate: guard("deactivate orders.list"),
        },
        { name: "other", path: "/other" },
      ],
    },
  ];
}

/** Prints a `Date` as its calendar day; the state keeps the object. */
const printDate = (value: unknown): unknown =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value;

/**
 * `orders` declares `?range`, which the leaf's codec prints, so an intent can
 * carry an array of objects: the query builder refuses an object element.
 */
function rangeTree(): Route[] {
  return [
    {
      name: "orders",
      path: "/orders?range",
      canActivate: guard("activate orders"),
      canDeactivate: guard("deactivate orders"),
      children: [
        {
          name: "list",
          path: "/list?page",
          encodeParams: ({ params, search }: ParamsSearch): ParamsSearch => {
            const range: unknown = search.range;

            return {
              params,
              search: {
                ...search,
                range: (Array.isArray(range)
                  ? range.map(printDate)
                  : printDate(range)) as SearchParamValue,
              },
            };
          },
        },
      ],
    },
  ];
}

function collisionTree(): Route[] {
  return [
    {
      name: "items",
      path: "/items/:id?id",
      canActivate: guard("activate items"),
      children: [{ name: "view", path: "/view" }],
    },
    {
      name: "cl",
      path: "/cl/:id",
      children: [
        { name: "y", path: "/y?id", canActivate: guard("activate cl.y") },
      ],
    },
  ];
}

async function startAt(
  path: string,
  routes: Route[],
  options: Partial<Options> = {},
): Promise<[Router, State]> {
  const instance = createRouter(routes, {
    defaultRoute: "orders.list",
    ...options,
  });

  router = instance;

  const from = await instance.start(path);

  log = [];

  return [instance, from];
}

function segmentsOf(state: State) {
  const { deactivated, activated, intersection } = state.transition.segments;

  return {
    deactivated: [...deactivated],
    activated: [...activated],
    intersection,
  };
}

const LEAF_ONLY = {
  deactivated: ["orders.list"],
  activated: ["orders.list"],
  intersection: "orders",
};

const PARENT_AND_LEAF = {
  deactivated: ["orders.list", "orders"],
  activated: ["orders", "orders.list"],
  intersection: "",
};

const PARENT_AND_LEAF_GUARDS = [
  "deactivate orders.list",
  "deactivate orders",
  "activate orders",
  "activate orders.list",
];

/**
 * A change of the parent's query param the comparison must see. Columns: the
 * start URL, its `search` as the router parsed it, the target `search`.
 */
const PRESENCE_CHANGES: [string, string, SearchParams, SearchParams][] = [
  ["appears", "/orders/list?page=1", { page: 1 }, { status: "new", page: "1" }],
  [
    "disappears",
    "/orders/list?status=new&page=1",
    { status: "new", page: 1 },
    { page: "1" },
  ],
  [
    "changes an array element",
    "/orders/list?tags=a&tags=b&page=1",
    { tags: ["a", "b"], page: 1 },
    { tags: ["a", "c"], page: "1" },
  ],
  [
    "grows from one value to an array",
    "/orders/list?tags=a&page=1",
    { tags: "a", page: 1 },
    { tags: ["a", "b"], page: "1" },
  ],
  [
    "shrinks from an array to one value",
    "/orders/list?tags=a&tags=b&page=1",
    { tags: ["a", "b"], page: 1 },
    { tags: "a", page: "1" },
  ],
  [
    "appears as an array",
    "/orders/list?page=1",
    { page: 1 },
    { tags: ["a", "b"], page: "1" },
  ],
  [
    "disappears as an array",
    "/orders/list?tags=a&tags=b&page=1",
    { tags: ["a", "b"], page: 1 },
    { page: "1" },
  ],
  [
    "turns from a bare flag into an object value",
    "/orders/list?status&page=1",
    { status: null, page: 1 },
    { status: dateValue(), page: "1" },
  ],
];

/** The parent's query param printed the same way: no change. Columns as above. */
const FORM_ONLY_CHANGES: [string, string, SearchParams, SearchParams][] = [
  [
    "a URL-parsed number against the same value as a string",
    "/orders/list?status=1&page=1",
    { status: 1, page: 1 },
    { status: "1", page: "2" },
  ],
  [
    "a singleton array against the same bare value",
    "/orders/list?tags=a&page=1",
    { tags: "a", page: 1 },
    { tags: ["a"], page: "2" },
  ],
];

/**
 * The parent's query param appears as a value the URL does not print, beside a
 * change of the leaf's: the parent re-enters, though its piece of the URL stays
 * the same (#2894). Columns: the router options, the target `search`.
 */
const UNPRINTED_PRESENCE: [string, Partial<Options>, SearchParams][] = [
  ["an empty array against an absent key", {}, { tags: [], page: "2" }],
  [
    "null against an absent key under nullFormat hidden",
    { queryParams: { nullFormat: "hidden" } },
    { status: null, page: "2" },
  ],
];

/** `range` from one navigation, then from the next: fresh objects, same days. */
const OBJECT_FORM_ONLY: [string, SearchParamValue, SearchParamValue][] = [
  ["an array of objects against a fresh copy", dates(1, 2), dates(1, 2)],
  [
    "a bare object against a one-element array of a copy",
    dateValue(1),
    dates(1),
  ],
  ["a one-element array against a bare copy", dates(1), dateValue(1)],
];

/** `range` changes its length, which the printed URL shows. */
const OBJECT_LENGTH_CHANGES: [string, SearchParamValue, SearchParamValue][] = [
  ["shrinks from two objects to one bare object", dates(1, 2), dateValue(1)],
  ["grows from one bare object to two", dateValue(1), dates(1, 2)],
];

const QUERY_PARAMS_MODES = ["default", "strict", "loose"] as const;

/**
 * Not own-enumerable: outside the supported input shapes (core CLAUDE.md,
 * "Supported Input Shapes"), so which way the predicate answers is not promised.
 */
const UNSUPPORTED_SHAPE_LABELS = new Set([
  "inherited through the prototype",
  "own non-enumerable",
]);
const SUPPORTED_SHAPES = CONTAINER_SHAPES.filter(
  ([label]) => !UNSUPPORTED_SHAPE_LABELS.has(label),
);
const UNSUPPORTED_SHAPES = CONTAINER_SHAPES.filter(([label]) =>
  UNSUPPORTED_SHAPE_LABELS.has(label),
);

describe("a segment's query params are part of its identity (#2689)", () => {
  beforeEach(() => {
    log = [];
  });

  afterEach(() => {
    router?.dispose();
    router = undefined;
  });

  it("registers every row of its tables", () => {
    expect(PRESENCE_CHANGES).toHaveLength(8);
    expect(FORM_ONLY_CHANGES).toHaveLength(2);
    expect(UNPRINTED_PRESENCE).toHaveLength(2);
    expect(OBJECT_FORM_ONLY).toHaveLength(3);
    expect(OBJECT_LENGTH_CHANGES).toHaveLength(2);
    expect(QUERY_PARAMS_MODES).toHaveLength(3);
    expect(CONTAINER_SHAPES).toHaveLength(6);
    expect(SUPPORTED_SHAPES).toHaveLength(4);
    expect(UNSUPPORTED_SHAPES).toHaveLength(2);
  });

  describe("a search-only navigation re-enters the segment that declares the key", () => {
    it("re-enters a parent whose own query param changed: guards run and its node updates", async () => {
      const [r, from] = await startAt(
        "/orders/list?status=new&page=1",
        ordersTree(),
      );

      const to = await r.navigate(
        "orders.list",
        {},
        { status: "closed", page: "1" },
      );

      expect(segmentsOf(to)).toStrictEqual(PARENT_AND_LEAF);
      expect(log).toStrictEqual(PARENT_AND_LEAF_GUARDS);
      expect(r.shouldUpdateNode("orders")(to, from)).toBe(true);
    });

    it("re-enters only the leaf when the leaf's own query param changed", async () => {
      const [r] = await startAt("/orders/list?status=new&page=1", ordersTree());

      const to = await r.navigate(
        "orders.list",
        {},
        { status: "new", page: "2" },
      );

      expect(segmentsOf(to)).toStrictEqual(LEAF_ONLY);
      expect(log).toStrictEqual([
        "deactivate orders.list",
        "activate orders.list",
      ]);
    });

    it.each(UNPRINTED_PRESENCE)(
      "re-enters the parent for a value of its query param the URL does not print: %s",
      async (_, options, target) => {
        // Control: the same options and URL without the key re-enter the leaf.
        const [control] = await startAt(
          "/orders/list?page=1",
          ordersTree(),
          options,
        );
        const without = await control.navigate(
          "orders.list",
          {},
          { page: "2" },
        );

        expect(segmentsOf(without)).toStrictEqual(LEAF_ONLY);

        control.dispose();

        const [r] = await startAt("/orders/list?page=1", ordersTree(), options);

        const to = await r.navigate("orders.list", {}, target);

        expect(to.path).toBe(without.path);
        expect(segmentsOf(to)).toStrictEqual(PARENT_AND_LEAF);
      },
    );

    it("asks the guard of the segment that owns the changed key, so a change it refuses is refused", async () => {
      const [r] = await startAt("/orders/list?status=new&page=2", ordersTree());

      expect(
        r.canNavigateTo("orders.list", {}, { status: "new", page: "3" }),
      ).toBe(true);
      expect(
        r.canNavigateTo("orders.list", {}, { status: "new", page: "10" }),
      ).toBe(false);

      await expect(
        r.navigate("orders.list", {}, { status: "new", page: "10" }),
      ).rejects.toMatchObject({ code: errorCodes.CANNOT_ACTIVATE });
      expect(r.getState()?.path).toBe("/orders/list?status=new&page=2");
    });

    it("re-enters the parent on the door a URL plugin uses for Back, and only the leaf when its status is the same", async () => {
      const [r] = await startAt("/orders/list?status=new&page=1", ordersTree());
      const api = getPluginApi(r);

      await r.navigate("orders.list", {}, { status: "closed", page: "2" });
      log = [];

      // A parsed URL holds `page: 1`, the intent held `page: "2"`.
      const back = await api.navigateToState(
        api.matchPath("/orders/list?status=new&page=1")!,
      );

      expect(segmentsOf(back)).toStrictEqual(PARENT_AND_LEAF);
      expect(log).toStrictEqual(PARENT_AND_LEAF_GUARDS);

      await r.navigate("orders.list", {}, { status: "new", page: "2" });

      const sameStatus = await api.navigateToState(
        api.matchPath("/orders/list?status=new&page=1")!,
      );

      expect(segmentsOf(sameStatus)).toStrictEqual(LEAF_ONLY);
    });

    it.each(PRESENCE_CHANGES)(
      "re-enters the parent when its query param %s",
      async (_, start, parsed, search) => {
        const [r, from] = await startAt(start, ordersTree());

        expect(from.search).toStrictEqual(parsed);

        const to = await r.navigate("orders.list", {}, search);

        expect(segmentsOf(to)).toStrictEqual(PARENT_AND_LEAF);
        expect(log).toStrictEqual(PARENT_AND_LEAF_GUARDS);
      },
    );

    it.each(OBJECT_LENGTH_CHANGES)(
      "re-enters the parent when its query param of objects %s",
      async (_, first, second) => {
        const [r] = await startAt("/orders/list?page=1", rangeTree());

        await r.navigate("orders.list", {}, { range: first, page: "1" });
        log = [];

        const to = await r.navigate(
          "orders.list",
          {},
          { range: second, page: "1" },
        );

        expect(to.search.range).toStrictEqual(second);
        expect(segmentsOf(to)).toStrictEqual(PARENT_AND_LEAF);
        expect(log).toStrictEqual(["deactivate orders", "activate orders"]);
      },
    );

    it.each(QUERY_PARAMS_MODES)(
      "re-enters a segment that declares one name in both channels when only the query twin changes (queryParamsMode: %s)",
      async (queryParamsMode) => {
        const [r] = await startAt("/items/1/view?id=a", collisionTree(), {
          defaultRoute: "items.view",
          queryParamsMode,
        });

        const to = await r.navigate("items.view", { id: "1" }, { id: "b" });

        expect(segmentsOf(to)).toStrictEqual({
          deactivated: ["items.view", "items"],
          activated: ["items", "items.view"],
          intersection: "",
        });
        expect(log).toStrictEqual(["activate items"]);
      },
    );

    it("re-enters the child that declares a query name its parent uses as a path slot", async () => {
      const [r] = await startAt("/cl/1/y?id=a", collisionTree(), {
        defaultRoute: "cl.y",
      });

      const to = await r.navigate("cl.y", { id: "1" }, { id: "b" });

      // Only the child's half is the contract. Re-entering `cl` as well is the
      // comparator's known over-report for a name split across two levels, and
      // it is deliberately not pinned either way.
      expect(segmentsOf(to).deactivated).toContain("cl.y");
      expect(segmentsOf(to).activated).toContain("cl.y");
      expect(log).toStrictEqual(["activate cl.y"]);
    });
  });

  describe("what a search-only navigation does NOT count as a segment change", () => {
    it.each(FORM_ONLY_CHANGES)(
      "keeps the parent when its query param differs only in form: %s",
      async (_, start, parsed, search) => {
        const [r, from] = await startAt(start, ordersTree());

        expect(from.search).toStrictEqual(parsed);

        const to = await r.navigate("orders.list", {}, search);

        expect(segmentsOf(to)).toStrictEqual(LEAF_ONLY);
      },
    );

    it("keeps the parent when its query param is an object that only changed identity", async () => {
      const [r] = await startAt("/orders/list?page=1", ordersTree());

      // A codec or a search schema can hand back a fresh object for a value
      // that did not change: two `Date`s of one instant share a key (#2905).
      const first = await r.navigate(
        "orders.list",
        {},
        { status: dateValue(), page: "1" },
      );

      expect(first.search.status).toBeInstanceOf(Date);

      const to = await r.navigate(
        "orders.list",
        {},
        { status: dateValue(), page: "2" },
      );

      expect(to.search.status).toBeInstanceOf(Date);
      expect(segmentsOf(to)).toStrictEqual(LEAF_ONLY);
    });

    it.each(OBJECT_FORM_ONLY)(
      "keeps the parent when its query param holds objects that only changed identity: %s",
      async (_, first, second) => {
        const [r] = await startAt("/orders/list?page=1", rangeTree());

        await r.navigate("orders.list", {}, { range: first, page: "1" });

        const to = await r.navigate(
          "orders.list",
          {},
          { range: second, page: "2" },
        );

        expect(to.search.range).toStrictEqual(second);
        expect(segmentsOf(to)).toStrictEqual(LEAF_ONLY);
      },
    );

    it("keeps the parent when only the child changes and the parent's query param does not", async () => {
      const [r] = await startAt("/orders/list?status=new&page=1", ordersTree());

      const to = await r.navigate("orders.other", {}, { status: "new" });

      expect(segmentsOf(to)).toStrictEqual({
        deactivated: ["orders.list"],
        activated: ["orders.other"],
        intersection: "orders",
      });
    });

    it("re-enters nothing for a query key no segment declares (a root ?-declaration)", async () => {
      // `default` mode prints only declared keys, so the root declaration is
      // what lets `lang` reach the URL at all.
      const instance = createRouter(ordersTree(), {
        defaultRoute: "orders.list",
        queryParamsMode: "default",
      });

      router = instance;
      getPluginApi(instance).setRootPath("?lang");
      await instance.start("/orders/list?lang=en&page=1");

      const to = await instance.navigate(
        "orders.list",
        {},
        { lang: "ru", page: "1" },
      );

      expect(to.path).toBe("/orders/list?lang=ru&page=1");
      expect(segmentsOf(to)).toStrictEqual({
        deactivated: [],
        activated: [],
        intersection: "orders.list",
      });

      // The same router still sees a change a segment declares.
      const next = await instance.navigate(
        "orders.list",
        {},
        { lang: "ru", page: "2" },
      );

      expect(segmentsOf(next)).toStrictEqual(LEAF_ONLY);
    });
  });

  describe("a path slot, compared by the same rule", () => {
    /** `docs` declares the slot `:ids`; the leaf's codec prints a list as one slot. */
    function listSlotTree(): Route[] {
      return [
        {
          name: "docs",
          path: "/docs/:ids",
          canActivate: guard("activate docs"),
          canDeactivate: guard("deactivate docs"),
          children: [
            {
              name: "view",
              path: "/view?page",
              encodeParams: ({
                params,
                search,
              }: ParamsSearch): ParamsSearch => ({
                params: {
                  ...params,
                  ids: [params.ids].flat().map(String).join("-"),
                },
                search,
              }),
            },
          ],
        },
      ];
    }

    it("re-enters the segment when an element of the list its slot holds changes, and not for a fresh copy", async () => {
      const [r] = await startAt("/docs/a/view?page=1", listSlotTree(), {
        defaultRoute: "docs.view",
      });

      await r.navigate("docs.view", { ids: ["a", "b"] }, { page: "1" });
      log = [];

      const changed = await r.navigate(
        "docs.view",
        { ids: ["a", "c"] },
        { page: "1" },
      );

      expect(changed.path).toBe("/docs/a-c/view?page=1");
      expect(segmentsOf(changed)).toStrictEqual({
        deactivated: ["docs.view", "docs"],
        activated: ["docs", "docs.view"],
        intersection: "",
      });
      expect(log).toStrictEqual(["deactivate docs", "activate docs"]);

      const copy = await r.navigate(
        "docs.view",
        { ids: ["a", "c"] },
        { page: "2" },
      );

      expect(segmentsOf(copy)).toStrictEqual({
        deactivated: ["docs.view"],
        activated: ["docs.view"],
        intersection: "docs",
      });
    });
  });

  // Both commit doors copy a State's `search` into a bag of the router's own; a
  // State handed to this predicate is read as the caller built it.
  describe("a State the caller hands to shouldUpdateNode", () => {
    async function changedStatus(): Promise<
      [(to: State, from?: State) => boolean, State, State]
    > {
      const [r, from] = await startAt(
        "/orders/list?status=new&page=1",
        ordersTree(),
      );
      const to = await r.navigate(
        "orders.list",
        {},
        { status: "closed", page: "1" },
      );

      return [r.shouldUpdateNode("orders"), to, from];
    }

    const withSearch = (state: State, search: object): State =>
      ({ ...state, search }) as State;

    it.each(SUPPORTED_SHAPES)(
      "reads its search bag like the control: %s",
      async (_, wrap) => {
        const [shouldUpdate, to, from] = await changedStatus();

        expect(
          shouldUpdate(
            withSearch(to, wrap({ status: "closed", page: "1" })),
            from,
          ),
        ).toBe(true);
        expect(
          shouldUpdate(
            withSearch(to, wrap({ status: "new", page: "1" })),
            from,
          ),
        ).toBe(false);
      },
    );

    it.each(UNSUPPORTED_SHAPES)(
      "answers without throwing for a bag outside the supported shapes: %s",
      async (_, wrap) => {
        const [shouldUpdate, to, from] = await changedStatus();

        expect(
          typeof shouldUpdate(
            withSearch(to, wrap({ status: "closed", page: "1" })),
            from,
          ),
        ).toBe("boolean");
      },
    );

    it("reads the deciding key once, and a read that throws reaches the caller", async () => {
      const [shouldUpdate, to, from] = await changedStatus();
      const { bag, reads } = countingBag({ status: "closed", page: "1" });
      const error = new Error("a reactive store refused the read");

      expect(shouldUpdate(withSearch(to, bag), from)).toBe(true);
      expect(reads).toStrictEqual({ status: 1 });
      expect(() =>
        shouldUpdate(
          withSearch(to, throwingBag({ status: "closed" }, error)),
          from,
        ),
      ).toThrow(error);
    });

    /** An array behind a Proxy that records every property read. */
    function countedList(items: string[]): { list: string[]; keys: string[] } {
      const keys: string[] = [];
      const list = new Proxy(items, {
        get(target, key, receiver): unknown {
          keys.push(String(key));

          return Reflect.get(target, key, receiver) as unknown;
        },
      });

      return { list, keys };
    }

    it("does not walk a list it finds on both sides", async () => {
      const [shouldUpdate, to, from] = await changedStatus();
      const { list, keys } = countedList(["a", "b"]);

      expect(
        shouldUpdate(
          withSearch(to, { status: "new", tags: list }),
          withSearch(from, { status: "new", tags: list }),
        ),
      ).toBe(false);
      expect(keys).toStrictEqual([]);
    });

    it("reads a list's length once and each element once", async () => {
      const [shouldUpdate, to, from] = await changedStatus();
      const next = countedList(["a", "b"]);
      const previous = countedList(["a", "b"]);

      expect(
        shouldUpdate(
          withSearch(to, { status: "new", tags: next.list }),
          withSearch(from, { status: "new", tags: previous.list }),
        ),
      ).toBe(false);
      expect(next.keys).toStrictEqual(["length", "0", "1"]);
      expect(previous.keys).toStrictEqual(["length", "0", "1"]);
    });
  });
});
