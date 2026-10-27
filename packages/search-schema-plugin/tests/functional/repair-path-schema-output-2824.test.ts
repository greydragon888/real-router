import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, expect, it, vi } from "vitest";

import { searchSchemaPlugin } from "@real-router/search-schema-plugin";

import { createMockSchema } from "./test-utils";

import type { SearchParams } from "@real-router/core";
import type {
  StandardSchemaV1,
  StandardSchemaV1Issue,
} from "@real-router/search-schema-plugin";

/**
 * A query the schema rejects is repaired: each key an issue names takes its
 * `defaultSearch` value, or is dropped. A repaired query the schema accepts
 * comes back as a valid one does, as the schema outputs it; one it still
 * rejects comes back as decoded (#2824).
 */

/** What one declared key parses to: its output, an issue about it, or nothing. */
type FieldResult =
  { readonly value: unknown } | { readonly issue: string } | undefined;

type Field = (input: unknown) => FieldResult;

/**
 * A zod-like object schema: each declared key runs its field, an undeclared key
 * is left out of the output (zod's default strip), an issue names the key it is
 * about, and `refine` reports a PATH-LESS issue, as a cross-field `.refine()`
 * does.
 */
function objectSchema(
  fields: Readonly<Record<string, Field>>,
  refine?: (output: Readonly<Record<string, unknown>>) => boolean,
): StandardSchemaV1 {
  return createMockSchema({
    validate: (input) => {
      const bag = input as Readonly<Record<string, unknown>>;
      const output: Record<string, unknown> = {};
      const issues: StandardSchemaV1Issue[] = [];

      for (const [key, field] of Object.entries(fields)) {
        const result = field(bag[key]);

        if (result === undefined) {
          continue;
        }

        if ("issue" in result) {
          issues.push({ message: result.issue, path: [key] });
        } else {
          output[key] = result.value;
        }
      }

      if (refine && !refine(output)) {
        issues.push({ message: "the combination is invalid" });
      }

      return issues.length > 0 ? { issues } : { value: output };
    },
  });
}

const optional =
  (parse: Field): Field =>
  (input) =>
    input === undefined ? undefined : parse(input);

const withDefault =
  (parse: Field, fallback: unknown): Field =>
  (input) =>
    input === undefined ? { value: fallback } : parse(input);

/**
 * `z.coerce.number()`, narrowed by `accept`. Without `optional` it is required:
 * `undefined` coerces to `NaN`.
 */
const coercedNumber =
  (accept: (number: number) => boolean = () => true): Field =>
  (input) => {
    const number = Number(input);

    return Number.isNaN(number) || !accept(number)
      ? { issue: "invalid number" }
      : { value: number };
  };

const oneOf =
  (...options: readonly unknown[]): Field =>
  (input) =>
    options.includes(input) ? { value: input } : { issue: "invalid option" };

/** A string, run through `transform`. Every cell hands it one. */
const text =
  (transform: (value: string) => string): Field =>
  (input) => ({ value: transform(input as string) });

/** The issue's first reproduction: the schema coerces, as under `"none"`. */
const pagingSchema = objectSchema({
  status: optional(oneOf("open", "closed")),
  page: optional(coercedNumber()),
  size: optional(coercedNumber((number) => [25, 50, 100].includes(number))),
});

/** The issue's second reproduction: a transform and a schema default. */
const listingSchema = objectSchema({
  status: optional(oneOf("open", "closed")),
  q: optional(text((value) => value.trim())),
  sort: withDefault(oneOf("name", "date"), "name"),
});

const requiredPageSchema = objectSchema({
  page: coercedNumber(),
  size: optional(coercedNumber()),
});

const lowercasedSortSchema = objectSchema({
  status: optional(oneOf("open", "closed")),
  sort: optional(text((value) => value.toLowerCase())),
});

const rangeSchema = objectSchema(
  { min: coercedNumber(), max: coercedNumber() },
  (output) => (output.min as number) < (output.max as number),
);

const NONE = { numberFormat: "none" } as const;

interface Setup {
  readonly path: string;
  readonly searchSchema: StandardSchemaV1;
  readonly defaultSearch?: SearchParams;
  readonly queryParams?: typeof NONE;
  readonly strict?: boolean;
}

interface Settled {
  readonly search: SearchParams;
  readonly path: string;
}

interface Cell extends Setup {
  readonly name: string;
  /** A URL whose query the schema rejects. */
  readonly url: string;
  /** The same URL with each rejected key at its `defaultSearch` value, or left out. */
  readonly control: string;
  /**
   * What both URLs settle to. Pinned rather than read off the control: a door
   * broken for both URLs would agree with itself.
   */
  readonly expected: Settled;
}

const PAGING: Setup = {
  path: "/list?status&page&size",
  searchSchema: pagingSchema,
  queryParams: NONE,
};

const LISTING: Setup = {
  path: "/list?status&q&sort",
  searchSchema: listingSchema,
};

const REQUIRED_PAGE: Setup = {
  path: "/list?page&size",
  searchSchema: requiredPageSchema,
  queryParams: NONE,
};

function routerFor(setup: Setup) {
  const router = createRouter(
    [
      { name: "home", path: "/" },
      {
        name: "list",
        path: setup.path,
        searchSchema: setup.searchSchema,
        ...(setup.defaultSearch && { defaultSearch: setup.defaultSearch }),
      },
    ],
    setup.queryParams ? { queryParams: setup.queryParams } : {},
  );

  router.usePlugin(
    searchSchemaPlugin({ mode: "production", strict: setup.strict ?? false }),
  );

  return router;
}

async function settle(setup: Setup, url: string): Promise<Settled> {
  const router = routerFor(setup);
  const { search, path } = await router.start(url);

  router.stop();

  return { search, path };
}

describe("search-schema-plugin — a repaired query carries the schema's output (#2824)", () => {
  describe("a key the schema accepted is what it is on the URL without the rejected one", () => {
    it.each<Cell>([
      {
        name: "a coerced number next to a rejected enum value",
        ...PAGING,
        url: "/list?status=nope&page=2",
        control: "/list?page=2",
        expected: { search: { page: 2 }, path: "/list?page=2" },
      },
      {
        name: "a coerced number next to a rejected coerced value",
        ...PAGING,
        url: "/list?page=2&size=200",
        control: "/list?page=2",
        expected: { search: { page: 2 }, path: "/list?page=2" },
      },
      {
        name: "a transform, and a schema default for an absent key",
        ...LISTING,
        url: "/list?q=%20shoes%20&status=nope",
        control: "/list?q=%20shoes%20",
        expected: {
          search: { q: "shoes", sort: "name" },
          path: "/list?q=shoes&sort=name",
        },
      },
      {
        name: "strict: false keeps a key the schema does not declare",
        ...PAGING,
        url: "/list?status=nope&page=2&utm=x",
        control: "/list?page=2&utm=x",
        expected: {
          search: { page: 2, utm: "x" },
          path: "/list?page=2&utm=x",
        },
      },
      {
        name: "strict: true drops a key the schema does not declare",
        ...PAGING,
        strict: true,
        url: "/list?status=nope&page=2&utm=x",
        control: "/list?page=2&utm=x",
        expected: { search: { page: 2 }, path: "/list?page=2" },
      },
      {
        name: "an absent key takes the schema default ahead of defaultSearch",
        ...LISTING,
        defaultSearch: { sort: "date" },
        url: "/list?q=x&status=nope",
        control: "/list?q=x",
        expected: {
          search: { q: "x", sort: "name" },
          path: "/list?q=x&sort=name",
        },
      },
      {
        name: "a defaultSearch value the schema rejects, on another key",
        ...PAGING,
        defaultSearch: { size: 999 },
        url: "/list?status=nope&page=2",
        control: "/list?page=2",
        expected: {
          search: { page: 2, size: 999 },
          path: "/list?page=2&size=999",
        },
      },
      {
        name: "a defaultSearch value for a key that was not repaired is not run through the schema",
        path: "/list?status&q&sort",
        searchSchema: lowercasedSortSchema,
        defaultSearch: { sort: "Date" },
        url: "/list?q=x&status=nope",
        control: "/list?q=x",
        expected: {
          search: { q: "x", sort: "Date" },
          path: "/list?q=x&sort=Date",
        },
      },
    ])("$name", async (cell) => {
      await expect(settle(cell, cell.control)).resolves.toStrictEqual(
        cell.expected,
      );
      await expect(settle(cell, cell.url)).resolves.toStrictEqual(
        cell.expected,
      );
    });
  });

  describe("the rejected key is replaced by its defaultSearch value, or dropped", () => {
    it.each<Cell>([
      {
        name: "restored from defaultSearch, through the schema",
        ...REQUIRED_PAGE,
        defaultSearch: { page: "1" },
        url: "/list?page=abc&size=25",
        control: "/list?page=1&size=25",
        expected: {
          search: { page: 1, size: 25 },
          path: "/list?page=1&size=25",
        },
      },
      {
        name: "a required key the URL leaves out, restored from defaultSearch",
        ...REQUIRED_PAGE,
        defaultSearch: { page: "1" },
        url: "/list?size=25",
        control: "/list?page=1&size=25",
        expected: {
          search: { page: 1, size: 25 },
          path: "/list?page=1&size=25",
        },
      },
      {
        name: "defaultSearch ahead of the schema default",
        ...LISTING,
        defaultSearch: { sort: "date" },
        url: "/list?q=%20shoes%20&sort=bogus",
        control: "/list?q=%20shoes%20&sort=date",
        expected: {
          search: { q: "shoes", sort: "date" },
          path: "/list?q=shoes&sort=date",
        },
      },
      {
        name: "with no defaultSearch for it, the schema default fills it",
        ...LISTING,
        url: "/list?q=%20shoes%20&sort=bogus",
        control: "/list?q=%20shoes%20",
        expected: {
          search: { q: "shoes", sort: "name" },
          path: "/list?q=shoes&sort=name",
        },
      },
    ])("$name", async (cell) => {
      await expect(settle(cell, cell.control)).resolves.toStrictEqual(
        cell.expected,
      );
      await expect(settle(cell, cell.url)).resolves.toStrictEqual(
        cell.expected,
      );
    });
  });

  describe("a repaired query the schema still rejects is written back as decoded", () => {
    it("a path-less refine names no key, so nothing is repaired", async () => {
      const setup: Setup = {
        path: "/list?min&max",
        searchSchema: rangeSchema,
        queryParams: NONE,
      };

      await expect(settle(setup, "/list?min=10&max=5")).resolves.toStrictEqual({
        search: { min: "10", max: "5" },
        path: "/list?min=10&max=5",
      });
    });

    it("a required key with no defaultSearch stays missing", async () => {
      await expect(
        settle(REQUIRED_PAGE, "/list?page=abc&size=25"),
      ).resolves.toStrictEqual({
        search: { size: "25" },
        path: "/list?size=25",
      });
    });

    it("a defaultSearch value the schema rejects, for the rejected key itself", async () => {
      await expect(
        settle(
          { ...PAGING, defaultSearch: { size: 999 } },
          "/list?page=2&size=200",
        ),
      ).resolves.toStrictEqual({
        search: { page: "2", size: 999 },
        path: "/list?page=2&size=999",
      });
    });

    it("under strict too, undeclared keys included: there is no schema output to hold it to", async () => {
      const setup: Setup = {
        path: "/list?min&max",
        searchSchema: rangeSchema,
        queryParams: NONE,
        strict: true,
      };

      await expect(
        settle(setup, "/list?min=10&max=5&utm=x"),
      ).resolves.toStrictEqual({
        search: { min: "10", max: "5", utm: "x" },
        path: "/list?min=10&max=5&utm=x",
      });
    });
  });

  describe("the schema runs once more, only on a repair", () => {
    it.each([
      {
        name: "a query the schema accepts",
        search: { q: "x" },
        schema: listingSchema,
        calls: 1,
      },
      {
        name: "a repaired query the schema accepts",
        search: { q: "x", status: "nope" },
        schema: listingSchema,
        calls: 2,
      },
      {
        name: "a repaired query the schema still rejects",
        search: { min: 10, max: 5 },
        schema: rangeSchema,
        calls: 2,
      },
    ])("$name: $calls call(s)", ({ search, schema, calls }) => {
      const validate = vi.fn(schema["~standard"].validate);
      const router = createRouter([
        {
          name: "list",
          path: "/list?status&q&sort&min&max",
          searchSchema: { "~standard": { ...schema["~standard"], validate } },
        },
      ]);

      router.usePlugin(searchSchemaPlugin({ mode: "production" }));
      getPluginApi(router).forwardState("list", {}, search);

      expect(validate).toHaveBeenCalledTimes(calls);
    });

    it("with onError, the callback answers after the one run", () => {
      const validate = vi.fn(listingSchema["~standard"].validate);
      const router = createRouter([
        {
          name: "list",
          path: "/list?status&q&sort",
          searchSchema: {
            "~standard": { ...listingSchema["~standard"], validate },
          },
        },
      ]);

      router.usePlugin(
        searchSchemaPlugin({
          mode: "production",
          onError: () => ({ q: "callback" }),
        }),
      );

      expect(
        getPluginApi(router).forwardState(
          "list",
          {},
          { q: "x", status: "nope" },
        ).search,
      ).toStrictEqual({ q: "callback" });
      expect(validate).toHaveBeenCalledTimes(1);
    });

    it("the second run refuses a Promise, as the first does", async () => {
      let calls = 0;
      const schema = createMockSchema({
        validate: () => {
          calls += 1;

          return calls === 1
            ? { issues: [{ message: "invalid", path: ["q"] }] }
            : Promise.resolve({ value: {} });
        },
      });
      const router = routerFor({ path: "/list?q", searchSchema: schema });

      await router.start("/");

      await expect(router.navigate("list", {}, { q: "x" })).rejects.toThrow(
        '[search-schema-plugin] Async schema validation is not supported. Route "list" returned a Promise from ~standard.validate().',
      );
      expect(calls).toBe(2);
    });

    it("a schema that throws on a restored default refuses the navigation", async () => {
      // The field assumes a string; the restored default is a number.
      const schema = objectSchema({
        page: optional((input) => coercedNumber()((input as string).trim())),
      });
      const validate = vi.fn(schema["~standard"].validate);
      const router = routerFor({
        path: "/list?page",
        searchSchema: { "~standard": { ...schema["~standard"], validate } },
        defaultSearch: { page: 1 },
      });

      await router.start("/");

      await expect(
        router.navigate("list", {}, { page: "abc" }),
      ).rejects.toThrow(/trim is not a function/);
      expect(validate).toHaveBeenCalledTimes(2);
      expect(router.getState()?.name).toBe("home");
    });
  });

  describe("navigate and buildPath get the repaired output too", () => {
    const broken = { q: " shoes ", status: "nope" };

    it("navigate", async () => {
      const router = routerFor(LISTING);

      await router.start("/");
      const repaired = await router.navigate("list", {}, broken);

      router.stop();

      expect(repaired.search).toStrictEqual({ q: "shoes", sort: "name" });
    });

    it("buildPath", () => {
      const router = routerFor(LISTING);

      expect(router.buildPath("list", {}, broken)).toBe(
        "/list?q=shoes&sort=name",
      );
    });
  });

  describe("a path slot and a params-bag key keep their channel", () => {
    it.each([
      { name: "on a repaired query", search: { q: " shoes ", status: "nope" } },
      { name: "on a query the schema accepts", search: { q: " shoes " } },
    ])("$name", async ({ search }) => {
      const router = routerFor({ ...LISTING, path: "/list/:id?status&q&sort" });

      await router.start("/");
      const state = await router.navigate(
        "list",
        { id: "7", extra: "fromParams" },
        search,
      );

      router.stop();

      expect({
        params: state.params,
        search: state.search,
        path: state.path,
      }).toStrictEqual({
        params: { id: "7", extra: "fromParams" },
        search: { q: "shoes", sort: "name" },
        path: "/list/7?q=shoes&sort=name",
      });
    });
  });

  // A navigation merges `defaultSearch` again below the plugin; a direct
  // `forwardState` call does not, so the repair's own merge is visible there.
  describe("a direct forwardState call carries the route's defaultSearch", () => {
    it("when the repaired query passes", () => {
      const router = routerFor({
        ...LISTING,
        defaultSearch: { status: "open" },
      });

      expect(
        getPluginApi(router).forwardState(
          "list",
          {},
          { q: " shoes ", sort: "bogus" },
        ).search,
      ).toStrictEqual({ status: "open", q: "shoes", sort: "name" });
    });

    it("when it fails again: the default of a key that was not repaired", () => {
      const router = routerFor({
        ...REQUIRED_PAGE,
        defaultSearch: { size: "50" },
      });

      expect(
        getPluginApi(router).forwardState("list", {}, { page: "abc" }).search,
      ).toStrictEqual({ size: "50" });
    });

    it("when it fails again: the rejected key's own default", () => {
      const router = routerFor({ ...PAGING, defaultSearch: { size: 999 } });

      expect(
        getPluginApi(router).forwardState(
          "list",
          {},
          { page: "2", size: "200" },
        ).search,
      ).toStrictEqual({ size: 999, page: "2" });
    });
  });
});
