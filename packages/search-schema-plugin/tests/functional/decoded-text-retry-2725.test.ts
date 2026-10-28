import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { searchSchemaPlugin } from "@real-router/search-schema-plugin";

import { createMockSchema, failingSchema } from "./test-utils";

import type { SearchParams } from "@real-router/core";
import type {
  SearchSchemaPluginOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
  StandardSchemaV1Result,
} from "@real-router/search-schema-plugin";

/**
 * Under `numberFormat` / `booleanFormat: "auto"` the router decodes `?q=17` to
 * the number 17 and `?q=true` to `true`. A schema field that wants text rejects
 * them, and the plugin tries each rejected value once more as its text,
 * `String(value)`, before it repairs the key (#2725).
 */

type Issues = readonly StandardSchemaV1Issue[];

/** What one declared key parses to: its output, the issues about it, or nothing. */
type FieldResult = { readonly value: unknown } | { readonly issues: Issues };

type Field = (input: unknown, key: string) => FieldResult | undefined;

type Parse = (input: unknown, key: string) => FieldResult;

/** A zod-like object schema: each declared key runs its field, an undeclared key is left out. */
function objectSchema(
  fields: Readonly<Record<string, Field>>,
): StandardSchemaV1 {
  return createMockSchema({
    validate: (input) => {
      const bag = input as Readonly<Record<string, unknown>>;
      const output: Record<string, unknown> = {};
      const issues: StandardSchemaV1Issue[] = [];

      for (const [key, field] of Object.entries(fields)) {
        const result = field(bag[key], key);

        if (result === undefined) {
          continue;
        }

        if ("issues" in result) {
          issues.push(...result.issues);
        } else {
          output[key] = result.value;
        }
      }

      return issues.length > 0 ? { issues } : { value: output };
    },
  });
}

const issue = (message: string, ...path: PropertyKey[]): Issues => [
  { message, path },
];

/** `.optional()`: an absent key stays absent. */
const optional =
  (parse: Parse): Field =>
  (input, key) =>
    input === undefined ? undefined : parse(input, key);

/** `z.string().optional()`, narrowed by `accept`. */
const text = (accept: (value: string) => boolean = () => true): Field =>
  optional((input, key) => {
    if (typeof input !== "string") {
      return {
        issues: issue(`expected string, received ${typeof input}`, key),
      };
    }

    return accept(input)
      ? { value: input }
      : { issues: issue("too short", key) };
  });

/**
 * `z.array(z.string()).optional()`, each element narrowed by `accept`: an issue
 * per element that is not a string or that `accept` refuses, at `[key, index]`
 * — or, with `segments`, at `[{ key }, { key: index }]`, the path-segment form
 * Standard Schema allows (valibot's).
 */
const textArray = (
  segments = false,
  accept: (value: string) => boolean = () => true,
): Field =>
  optional((input, key) => {
    if (!Array.isArray(input)) {
      return { issues: issue("expected array", key) };
    }

    const issues = input.flatMap((element: unknown, index) => {
      if (typeof element === "string" && accept(element)) {
        return [];
      }

      return [
        {
          message:
            typeof element === "string"
              ? "too short"
              : `expected string, received ${typeof element}`,
          path: segments ? [{ key }, { key: index }] : [key, index],
        },
      ];
    });

    return issues.length > 0 ? { issues } : { value: input };
  });

/**
 * `z.discriminatedUnion("step", …)`: `step` must be the text `"1"` or `"2"`,
 * and only step 2 reads `code`, as text — so a number in `code` is named only
 * once `step` is text.
 */
const steps = createMockSchema({
  validate: (input) => {
    const { step, code } = input as {
      readonly step?: unknown;
      readonly code?: unknown;
    };

    if (step === "1") {
      return { value: { step } };
    }

    if (step !== "2") {
      return { issues: issue("invalid discriminator", "step") };
    }

    if (typeof code !== "string") {
      return {
        issues: issue(`expected string, received ${typeof code}`, "code"),
      };
    }

    return code.length >= 3
      ? { value: { step, code } }
      : { issues: issue("too short", "code") };
  },
});

/**
 * `z.object({ a: z.string(), b: z.unknown() }).superRefine(…)`: the rule that
 * `b` is text runs only once the object parses.
 */
const refinedOnceParsed = createMockSchema({
  validate: (input) => {
    const { a, b } = input as { readonly a?: unknown; readonly b?: unknown };

    if (typeof a !== "string") {
      return { issues: issue(`expected string, received ${typeof a}`, "a") };
    }

    return typeof b === "string"
      ? { value: { a, b } }
      : { issues: issue("b must be text", "b") };
  },
});

/**
 * An array schema that stops at its first issue, one element per run: an
 * element that is not a string, or else one that `accept` refuses.
 */
const oneElementAtATime = (
  accept: (value: string) => boolean = () => true,
): StandardSchemaV1 =>
  createMockSchema({
    validate: (input) => {
      const { tags = [] } = input as { readonly tags?: readonly unknown[] };
      const index = tags.findIndex((element) => typeof element !== "string");

      if (index !== -1) {
        return {
          issues: [{ message: "expected string", path: ["tags", index] }],
        };
      }

      const refused = tags.findIndex((element) => !accept(element as string));

      return refused === -1
        ? { value: input }
        : { issues: [{ message: "too short", path: ["tags", refused] }] };
    },
  });

/**
 * `z.array(z.string()).superRefine(…)` that names each blank element: a rule
 * that runs only once every element is text.
 */
const blankless = objectSchema({
  tags: optional((input, key) => {
    const elements = textArray()(input, key);

    if (elements && "issues" in elements) {
      return elements;
    }

    const blank = (input as readonly string[]).flatMap((element, index) =>
      element === "" ? [{ message: "blank", path: [key, index] }] : [],
    );

    return blank.length > 0 ? { issues: blank } : { value: input };
  }),
});

/**
 * `z.array(z.string()).superRefine(…)` that names only the first element
 * shorter than two characters.
 */
const firstShort = objectSchema({
  tags: optional((input, key) => {
    const elements = textArray()(input, key);

    if (elements && "issues" in elements) {
      return elements;
    }

    const index = (input as readonly string[]).findIndex(
      (element) => element.length < 2,
    );

    return index === -1
      ? { value: input }
      : { issues: issue("too short", key, index) };
  }),
});

/**
 * `z.object(fields).refine(rule)`: zod runs a refinement after a range issue
 * and not after a type issue — the one the text of a number meets in a number
 * field — so the decoded query can hold an issue its text does not.
 */
function refined(
  fields: Readonly<Record<string, Field>>,
  rule: (bag: Readonly<Record<string, unknown>>) => Issues,
): StandardSchemaV1 {
  const object = objectSchema(fields)["~standard"];

  return createMockSchema({
    validate: (input) => {
      const result = object.validate(input) as StandardSchemaV1Result;
      const issues = "issues" in result ? result.issues : [];

      if (issues.some(({ message }) => message.startsWith("expected "))) {
        return result;
      }

      const all = [
        ...issues,
        ...rule(input as Readonly<Record<string, unknown>>),
      ];

      return all.length > 0 ? { issues: all } : result;
    },
  });
}

const STEPS: Setup = { path: "/search?step&code", searchSchema: steps };

/** `z.number().positive().optional()`: a string is a type issue, a number not above 0 a range one. */
const positive: Field = optional((input, key) => {
  if (typeof input !== "number") {
    return { issues: issue(`expected number, received ${typeof input}`, key) };
  }

  return input > 0 ? { value: input } : { issues: issue("too small", key) };
});

/** `z.array(z.number().positive()).optional()`, each element judged as `positive` is. */
const positives: Field = optional((input, key) => {
  if (!Array.isArray(input)) {
    return { issues: issue("expected array", key) };
  }

  const issues = input.flatMap((element: unknown, index) => {
    if (typeof element !== "number") {
      return issue(`expected number, received ${typeof element}`, key, index);
    }

    return element > 0 ? [] : issue("too small", key, index);
  });

  return issues.length > 0 ? { issues } : { value: input };
});

/** `z.number()` without `.optional()`: an absent key is an issue. */
const required: Field = (input, key) =>
  input === undefined ? { issues: issue("required", key) } : { value: input };

/** Rejects whatever the key holds, as a whole: `z.array(…).max(0)`, say. */
const rejected: Field = optional((_input, key) => ({
  issues: issue("too many", key),
}));

/** A string, or an issue one level inside the value, wherever it points. */
const nested: Field = optional((input, key) =>
  typeof input === "string"
    ? { value: input }
    : { issues: issue("nested", key, 0) },
);

/**
 * `z.object({ q: z.string() }).refine(({ q }) => q.length >= 3)`: a rule with
 * no path, which runs only once `q` is text.
 */
const wholeQuery = createMockSchema({
  validate: (input) => {
    const { q } = input as { readonly q?: unknown };

    if (typeof q !== "string") {
      return { issues: issue(`expected string, received ${typeof q}`, "q") };
    }

    return q.length >= 3
      ? { value: { q } }
      : { issues: [{ message: "q is too short" }] };
  },
});

/**
 * Accepts `q` as text and leaves it out of its output, as a reshaping
 * `.transform()` does: outside `strict`, the key comes from the query it judged.
 */
const judgedNotOutput = createMockSchema({
  validate: (input) =>
    typeof (input as { readonly q?: unknown }).q === "string"
      ? { value: {} }
      : { issues: issue("expected string", "q") },
});

const searchSchema = objectSchema({ q: text(), page: positive });

const NONE = { numberFormat: "none", booleanFormat: "none" } as const;

const EMPTY_TRUE = { booleanFormat: "empty-true" } as const;

type Formats = typeof NONE | typeof EMPTY_TRUE;

interface Setup {
  readonly path: string;
  readonly searchSchema: StandardSchemaV1;
  readonly mode?: "development" | "production";
  readonly onError?: SearchSchemaPluginOptions["onError"];
  readonly arrayFormat?: "brackets";
  readonly defaultSearch?: SearchParams;
}

interface Settled {
  readonly search: SearchParams;
  readonly path: string;
}

const SEARCH: Setup = { path: "/search?q&page", searchSchema };

const TAGS: Setup = {
  path: "/search?tags",
  searchSchema: objectSchema({ tags: textArray() }),
  arrayFormat: "brackets",
};

function routerFor(setup: Setup, formats: Formats | undefined) {
  const router = createRouter(
    [
      { name: "home", path: "/" },
      {
        name: "search",
        path: setup.path,
        searchSchema: setup.searchSchema,
        ...(setup.defaultSearch && { defaultSearch: setup.defaultSearch }),
      },
    ],
    {
      queryParams: {
        ...formats,
        ...(setup.arrayFormat && { arrayFormat: setup.arrayFormat }),
      },
    },
  );

  router.usePlugin(
    searchSchemaPlugin({
      mode: setup.mode ?? "production",
      ...(setup.onError && { onError: setup.onError }),
    }),
  );

  return router;
}

async function settle(
  setup: Setup,
  url: string,
  formats?: Formats,
): Promise<Settled> {
  const router = routerFor(setup, formats);
  const { search, path } = await router.start(url);

  router.stop();

  return { search, path };
}

interface Cell extends Setup {
  readonly name: string;
  readonly url: string;
  /**
   * What the URL settles to under the default formats and under `"none"`, where
   * the text arrives as text. Pinned rather than read off the `"none"` run: a
   * door broken for both would agree with itself.
   */
  readonly expected: Settled;
}

describe("search-schema-plugin — a decoded number or boolean is tried as its text (#2725)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('the text a rejected value was decoded from is kept, as under "none"', () => {
    it.each<Cell>([
      {
        name: "a number",
        ...SEARCH,
        url: "/search?q=17",
        expected: { search: { q: "17" }, path: "/search?q=17" },
      },
      {
        name: "true",
        ...SEARCH,
        url: "/search?q=true",
        expected: { search: { q: "true" }, path: "/search?q=true" },
      },
      {
        name: "false",
        ...SEARCH,
        url: "/search?q=false",
        expected: { search: { q: "false" }, path: "/search?q=false" },
      },
      {
        name: "a negative decimal",
        ...SEARCH,
        url: "/search?q=-1.5",
        expected: { search: { q: "-1.5" }, path: "/search?q=-1.5" },
      },
      {
        name: "array elements, each at its index",
        ...TAGS,
        url: "/search?tags[]=1&tags[]=a&tags[]=true",
        expected: {
          search: { tags: ["1", "a", "true"] },
          path: "/search?tags[]=1&tags[]=a&tags[]=true",
        },
      },
      {
        name: "array elements named by { key } path segments",
        ...TAGS,
        searchSchema: objectSchema({ tags: textArray(true) }),
        url: "/search?tags[]=a&tags[]=2",
        expected: {
          search: { tags: ["a", "2"] },
          path: "/search?tags[]=a&tags[]=2",
        },
      },
      {
        name: "a key the schema judges as text and leaves out of its output",
        path: "/search?q",
        searchSchema: judgedNotOutput,
        url: "/search?q=17",
        expected: { search: { q: "17" }, path: "/search?q=17" },
      },
      {
        name: "next to a key the text does not fix, which is repaired as before",
        ...SEARCH,
        url: "/search?q=17&page=0",
        expected: { search: { q: "17" }, path: "/search?q=17" },
      },
      {
        name: "next to a key restored from defaultSearch",
        ...SEARCH,
        defaultSearch: { page: 1 },
        url: "/search?q=17&page=0",
        expected: {
          search: { q: "17", page: 1 },
          path: "/search?q=17&page=1",
        },
      },
      {
        name: "a key named after an Object.prototype member",
        path: "/search?constructor",
        searchSchema: objectSchema({ constructor: text() }),
        url: "/search?constructor=17",
        expected: {
          search: { constructor: "17" },
          path: "/search?constructor=17",
        },
      },
      {
        name: "a number a discriminated union names only once the discriminator is text",
        ...STEPS,
        url: "/search?step=2&code=123456",
        expected: {
          search: { step: "2", code: "123456" },
          path: "/search?step=2&code=123456",
        },
      },
      {
        name: "a staged schema, repaired on what its last stage rejects",
        ...STEPS,
        defaultSearch: { step: "1" },
        url: "/search?step=2&code=12",
        expected: { search: { step: "2" }, path: "/search?step=2" },
      },
      {
        name: "a number a refinement names only once the object parses",
        path: "/search?a&b",
        searchSchema: refinedOnceParsed,
        url: "/search?a=1&b=2",
        expected: { search: { a: "1", b: "2" }, path: "/search?a=1&b=2" },
      },
      {
        name: "array elements a schema names one at a time",
        ...TAGS,
        searchSchema: oneElementAtATime(),
        url: "/search?tags[]=1&tags[]=true&tags[]=3",
        expected: {
          search: { tags: ["1", "true", "3"] },
          path: "/search?tags[]=1&tags[]=true&tags[]=3",
        },
      },
    ])("$name", async (cell) => {
      await expect(settle(cell, cell.url, NONE)).resolves.toStrictEqual(
        cell.expected,
      );
      await expect(settle(cell, cell.url)).resolves.toStrictEqual(
        cell.expected,
      );
    });
  });

  describe("navigate() and a reload of the URL it wrote agree", () => {
    it.each([
      { name: "the text", q: "17" },
      { name: "a number", q: 17 },
      { name: "a boolean", q: true },
      { name: "minus zero, whose text is the 0 the URL prints", q: -0 },
      { name: "NaN", q: Number.NaN },
    ])("$name", async ({ q }) => {
      const router = routerFor(SEARCH, undefined);

      await router.start("/");

      const state = await router.navigate("search", {}, { q });

      router.stop();

      expect(state.search).toStrictEqual({ q: String(q) });
      await expect(settle(SEARCH, state.path)).resolves.toStrictEqual({
        search: state.search,
        path: state.path,
      });
    });
  });

  describe("a text run is a schema run like the others", () => {
    it("refuses a Promise, as the first run does", async () => {
      const inputs: unknown[] = [];
      const schema = createMockSchema({
        validate: (input) => {
          inputs.push(structuredClone(input));

          return inputs.length === 1
            ? { issues: issue("expected string, received number", "q") }
            : Promise.resolve({ value: {} });
        },
      });

      await expect(
        settle({ path: "/search?q", searchSchema: schema }, "/search?q=17"),
      ).rejects.toThrow(
        '[search-schema-plugin] Async schema validation is not supported. Route "search" returned a Promise from ~standard.validate().',
      );
      expect(inputs).toStrictEqual([{ q: 17 }, { q: "17" }]);
    });

    it("a schema that throws on the text refuses the navigation", async () => {
      // A transform that assumes a URL: the number is rejected, and its text
      // reaches the transform.
      const schema = objectSchema({
        q: optional((input, key) =>
          typeof input === "string"
            ? { value: new URL(input).href }
            : { issues: issue("expected string", key) },
        ),
      });

      await expect(
        settle({ path: "/search?q", searchSchema: schema }, "/search?q=17"),
      ).rejects.toThrow("Invalid URL");
    });

    it("a schema that throws on the query the runs settle on refuses the navigation", async () => {
      // A refinement that assumes a positive page: only the query the runs
      // settle on hands it page 0 with nothing ahead of it but a range issue.
      const schema = refined({ q: text(), page: positive }, (bag) => {
        if (bag.page === 0) {
          throw new RangeError("page 0");
        }

        return [];
      });

      await expect(
        settle({ ...SEARCH, searchSchema: schema }, "/search?q=17&page=0"),
      ).rejects.toThrow("page 0");
    });

    it("a schema that throws on the repaired query, which keeps the text, refuses the navigation", async () => {
      // A refinement that assumes a URL: the absent `page` is a type issue on
      // every run before the repair, so the repaired query is the first to hand
      // it the text "17", next to the restored page.
      const schema = refined(
        {
          next: text(),
          page: (input, key) =>
            input === undefined
              ? { issues: issue("expected number, received undefined", key) }
              : { value: input },
        },
        (bag) =>
          typeof bag.next === "string" &&
          new URL(bag.next).protocol !== "https:"
            ? issue("not https", "next")
            : [],
      );

      await expect(
        settle(
          {
            path: "/search?next&page",
            searchSchema: schema,
            defaultSearch: { page: 1 },
          },
          "/search?next=17",
        ),
      ).rejects.toThrow("Invalid URL");
    });

    it("a schema that throws on the text refuses before onError is called", async () => {
      // A transform that assumes a URL, behind an onError that would keep the
      // number's text.
      const onError = vi.fn(() => ({ q: "17" }));
      const schema = objectSchema({
        q: optional((input, key) =>
          typeof input === "string"
            ? { value: new URL(input).href }
            : { issues: issue("expected string", key) },
        ),
      });

      await expect(
        settle(
          { path: "/search?q", searchSchema: schema, onError },
          "/search?q=17",
        ),
      ).rejects.toThrow("Invalid URL");
      expect(onError).not.toHaveBeenCalled();
    });

    it("a value is tried once, even when the schema writes the number back into its input", async () => {
      // `z.preprocess((bag) => { bag.q = Number(bag.q); return bag; }, …)`
      // over a text field: every run turns `q` back into a number.
      const inputs: unknown[] = [];
      const schema = createMockSchema({
        validate: (input) => {
          const bag = input as Record<string, unknown>;

          inputs.push(structuredClone(bag));

          if (inputs.length > 10) {
            throw new Error("the runs did not end");
          }

          if ("q" in bag) {
            bag.q = Number(bag.q);
          }

          return typeof bag.q === "string" || bag.q === undefined
            ? { value: bag }
            : { issues: issue("expected string, received number", "q") };
        },
      });

      await expect(
        settle({ path: "/search?q", searchSchema: schema }, "/search?q=17"),
      ).resolves.toStrictEqual({ search: {}, path: "/search" });
      expect(inputs).toStrictEqual([{ q: 17 }, { q: "17" }, {}]);
    });

    it("the rounds end when the schema writes a new number into its input on every run", async () => {
      // `z.preprocess((bag) => { bag.tags.push(0); return bag; }, …)` over an
      // array of text: every run adds an element no round has tried.
      const inputs: unknown[] = [];
      const schema = createMockSchema({
        validate: (input) => {
          const bag = input as { readonly tags?: unknown[] };

          inputs.push(structuredClone(bag));

          if (inputs.length > 10) {
            throw new Error("the runs did not end");
          }

          bag.tags?.push(0);

          const issues = (bag.tags ?? []).flatMap((element, index) =>
            typeof element === "string"
              ? []
              : issue("expected string, received number", "tags", index),
          );

          return issues.length > 0 ? { issues } : { value: bag };
        },
      });

      await expect(
        settle({ ...TAGS, searchSchema: schema }, "/search?tags[]=1"),
      ).resolves.toStrictEqual({ search: {}, path: "/search" });
      expect(inputs).toStrictEqual([{ tags: [1] }, { tags: ["1", "0"] }, {}]);
    });

    it("a value is tried once, even when the schema writes every element back and names them in turn", async () => {
      // Every run turns the elements back into numbers and names one: the
      // first, the second, the first again.
      const inputs: unknown[] = [];
      const schema = createMockSchema({
        validate: (input) => {
          const bag = input as { tags?: unknown[] };

          inputs.push(structuredClone(bag));

          if (inputs.length > 10) {
            throw new Error("the runs did not end");
          }

          if (bag.tags === undefined) {
            return { value: bag };
          }

          bag.tags = bag.tags.map(Number);

          return {
            issues: issue(
              "expected string, received number",
              "tags",
              (inputs.length - 1) % 2,
            ),
          };
        },
      });

      await expect(
        settle({ ...TAGS, searchSchema: schema }, "/search?tags[]=1&tags[]=2"),
      ).resolves.toStrictEqual({ search: {}, path: "/search" });
      expect(inputs).toStrictEqual([
        { tags: [1, 2] },
        { tags: ["1", 2] },
        { tags: [1, "2"] },
        {},
      ]);
    });
  });

  describe("what the schema is handed, run by run", () => {
    it.each([
      {
        name: "a query it accepts: once",
        url: "/search?q=x",
        inputs: [{ q: "x" }],
      },
      {
        name: "a number the text fixes: then its text",
        url: "/search?q=17",
        inputs: [{ q: 17 }, { q: "17" }],
      },
      {
        name: "a rejected value that is no number or boolean: then the repair",
        url: "/search?q",
        inputs: [{ q: null }, {}],
      },
      {
        name: "a number the text fixes next to one it does not: then both texts, then the query settled on, then the repair",
        url: "/search?q=17&page=0",
        inputs: [
          { q: 17, page: 0 },
          { q: "17", page: "0" },
          { q: "17", page: 0 },
          { q: "17" },
        ],
      },
      {
        name: "a number a number field rejects: then its text, then the repair",
        url: "/search?page=0",
        inputs: [{ page: 0 }, { page: "0" }, {}],
      },
      {
        name: "a number the text fixes next to a rejected text: then its text, then the repair",
        url: "/search?q=17&page=abc",
        inputs: [{ q: 17, page: "abc" }, { q: "17", page: "abc" }, { q: "17" }],
      },
    ])("$name", async ({ url, inputs }) => {
      const handed: unknown[] = [];
      const inner = searchSchema["~standard"];
      const recording = createMockSchema({
        validate: (input) => {
          handed.push(structuredClone(input));

          return inner.validate(input) as StandardSchemaV1Result;
        },
      });

      await settle({ ...SEARCH, searchSchema: recording }, url);

      expect(handed).toStrictEqual(inputs);
    });

    it.each([
      {
        name: "a schema that judges in stages: a round for each value it names once another is text",
        url: "/search?step=2&code=123456",
        inputs: [
          { step: 2, code: 123_456 },
          { step: "2", code: 123_456 },
          { step: "2", code: "123456" },
        ],
      },
      {
        name: "a staged schema can settle on a round's query: it runs again, then the repair",
        url: "/search?step=2&code=12",
        inputs: [
          { step: 2, code: 12 },
          { step: "2", code: 12 },
          { step: "2", code: "12" },
          { step: "2", code: 12 },
          { step: "2" },
        ],
      },
    ])("$name", async ({ url, inputs }) => {
      const handed: unknown[] = [];
      const recording = createMockSchema({
        validate: (input) => {
          handed.push(structuredClone(input));

          return steps["~standard"].validate(input) as StandardSchemaV1Result;
        },
      });

      await settle({ ...STEPS, searchSchema: recording }, url);

      expect(handed).toStrictEqual(inputs);
    });
  });

  describe("buildPath with the query in the params bag", () => {
    it.each([
      { name: "a text the schema accepts", q: "x" },
      { name: "a number whose text it accepts", q: 17 },
    ])("$name: the literal path, as without the plugin", async ({ q }) => {
      const router = routerFor(SEARCH, undefined);

      await router.start("/");

      expect(router.buildPath("search", { q })).toBe("/search");

      router.stop();
    });
  });

  describe("a key without a value", () => {
    it("decodes to null by default, which is never tried as text", async () => {
      await expect(settle(SEARCH, "/search?q")).resolves.toStrictEqual({
        search: {},
        path: "/search",
      });
    });

    it('decodes to true under booleanFormat "empty-true", which is kept as its text: the URL then prints ?q=true', async () => {
      await expect(
        settle(SEARCH, "/search?q", EMPTY_TRUE),
      ).resolves.toStrictEqual({
        search: { q: "true" },
        path: "/search?q=true",
      });
    });
  });

  describe('mode: "development" reports each rejected value, as decoded and as text', () => {
    const HEADER =
      '[search-schema-plugin] Route "search": the schema rejected these search params; each takes its default value or is removed:';
    const HINT =
      'The schema gets decoded values: under queryParams numberFormat / booleanFormat "auto" (the default) ?q=17 arrives as the number 17, ?q=true as true, and a key without a value as null. A rejected number or boolean — a key\'s value or an array element — is tried once more as its text.';
    // Paths and segments the Standard Schema spec does not allow.
    const NULL_SEGMENT = [
      { message: "bad", path: ["tags", null] },
    ] as unknown as Issues;
    const STRING_PATH = [{ message: "bad", path: "q" }] as unknown as Issues;
    const ARRAY_LIKE_PATH = [
      { message: "bad", path: { 0: "q", length: 1 } },
    ] as unknown as Issues;
    const LENGTHLESS_PATH = [{ message: "bad", path: {} }] as unknown as Issues;
    const KEYLESS_SEGMENT = [
      { message: "bad", path: [["q"]] },
    ] as unknown as Issues;

    interface Report extends Setup {
      readonly name: string;
      readonly url: string;
      readonly settled: Settled;
      /** The message, line by line. */
      readonly lines: readonly string[];
      /** The issues `console.error` is handed after it. */
      readonly issues: Issues;
    }

    it("a value the text fixes is not reported", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        settle({ ...SEARCH, mode: "development" }, "/search?q=17"),
      ).resolves.toStrictEqual({ search: { q: "17" }, path: "/search?q=17" });
      expect(error).not.toHaveBeenCalled();
    });

    it.each<Report>([
      {
        name: "both readings of each key the text does not fix",
        path: "/search?q&page",
        searchSchema: objectSchema({
          q: text((value) => value.length >= 3),
          page: positive,
        }),
        url: "/search?q=17&page=-1",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  q = 17 (number): expected string, received number",
          '  q as text "17": too short',
          "  page = -1 (number): too small",
          '  page as text "-1": expected number, received string',
          HINT,
        ],
        issues: [
          ...issue("expected string, received number", "q"),
          ...issue("too small", "page"),
        ],
      },
      {
        name: "a key the text fixes is left out",
        ...SEARCH,
        url: "/search?q=17&page=0",
        settled: { search: { q: "17" }, path: "/search?q=17" },
        lines: [
          HEADER,
          "  page = 0 (number): too small",
          '  page as text "0": expected number, received string',
          HINT,
        ],
        issues: issue("too small", "page"),
      },
      {
        name: "a key without a value",
        ...SEARCH,
        url: "/search?q",
        settled: { search: {}, path: "/search" },
        lines: [HEADER, "  q = null: expected string, received object", HINT],
        issues: issue("expected string, received object", "q"),
      },
      {
        name: "an array element",
        ...TAGS,
        url: "/search?tags[]=a&tags[]",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  tags[1] = null: expected string, received object",
          HINT,
        ],
        issues: [
          {
            message: "expected string, received object",
            path: ["tags", 1],
          },
        ],
      },
      {
        name: "a string, with no word on decoding",
        path: "/search?q",
        searchSchema: objectSchema({ q: text((value) => value.length >= 3) }),
        url: "/search?q=ab",
        settled: { search: {}, path: "/search" },
        lines: [HEADER, '  q = "ab": too short'],
        issues: issue("too short", "q"),
      },
      {
        name: "a string, quoted as JSON quotes it",
        path: "/search?q",
        searchSchema: objectSchema({ q: text((value) => value.length >= 5) }),
        url: "/search?q=a%22b",
        settled: { search: {}, path: "/search" },
        lines: [HEADER, String.raw`  q = "a\"b": too short`],
        issues: issue("too short", "q"),
      },
      {
        name: "an absent key",
        path: "/search?page",
        searchSchema: objectSchema({ page: required }),
        url: "/search",
        settled: { search: {}, path: "/search" },
        lines: [HEADER, "  page is absent: required"],
        issues: issue("required", "page"),
      },
      {
        name: "an issue that names no key",
        path: "/search?q",
        searchSchema: failingSchema([{ message: "min must be below max" }]),
        url: "/search?q=x",
        settled: { search: { q: "x" }, path: "/search?q=x" },
        lines: [
          '[search-schema-plugin] Route "search": the schema rejected these search params:',
          "  the query as a whole: min must be below max — nothing removed",
        ],
        issues: [{ message: "min must be below max" }],
      },
      {
        name: "an array, by its type alone",
        ...TAGS,
        searchSchema: objectSchema({ tags: rejected }),
        url: "/search?tags[]=a&tags[]=b",
        settled: { search: {}, path: "/search" },
        lines: [HEADER, "  tags = (array): too many"],
        issues: issue("too many", "tags"),
      },
      {
        name: "a key the router did not decode, which has no text reading",
        path: "/search?q&page",
        searchSchema: objectSchema({
          q: text((value) => value.length >= 3),
          page: positive,
        }),
        url: "/search?q=17&page=abc",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  q = 17 (number): expected string, received number",
          '  q as text "17": too short',
          '  page = "abc": expected number, received string',
          HINT,
        ],
        issues: [
          ...issue("expected string, received number", "q"),
          ...issue("expected number, received string", "page"),
        ],
      },
      {
        name: "the text reading of a key follows its last issue, and names each value tried",
        ...TAGS,
        url: "/search?tags[]=1&tags[]",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  tags[0] = 1 (number): expected string, received number",
          "  tags[1] = null: expected string, received object",
          "  tags[1] as text null: expected string, received object",
          '  tags[0] as text "1": no issue reported',
          HINT,
        ],
        issues: [
          { message: "expected string, received number", path: ["tags", 0] },
          { message: "expected string, received object", path: ["tags", 1] },
        ],
      },
      {
        name: "an element whose text fails, next to one whose text passes",
        ...TAGS,
        searchSchema: objectSchema({
          tags: textArray(false, (value) => value.length >= 2),
        }),
        url: "/search?tags[]=1&tags[]=22",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  tags[0] = 1 (number): expected string, received number",
          "  tags[1] = 22 (number): expected string, received number",
          '  tags[0] as text "1": too short',
          '  tags[1] as text "22": no issue reported',
          HINT,
        ],
        issues: [
          { message: "expected string, received number", path: ["tags", 0] },
          { message: "expected string, received number", path: ["tags", 1] },
        ],
      },
      {
        name: "an issue about the whole array, once its elements are text",
        ...TAGS,
        searchSchema: objectSchema({
          tags: optional((input, key) => {
            const elements = textArray()(input, key);

            return elements && "issues" in elements
              ? elements
              : { issues: issue("too few", key) };
          }),
        }),
        url: "/search?tags[]=1&tags[]=2",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  tags[0] = 1 (number): expected string, received number",
          "  tags[1] = 2 (number): expected string, received number",
          "  tags as text (array): too few",
          '  tags[0] as text "1": no issue reported',
          '  tags[1] as text "2": no issue reported',
          HINT,
        ],
        issues: [
          { message: "expected string, received number", path: ["tags", 0] },
          { message: "expected string, received number", path: ["tags", 1] },
        ],
      },
      {
        name: "an issue about an element that was text all along, once the array parses",
        ...TAGS,
        searchSchema: blankless,
        url: "/search?tags[]=&tags[]=5",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  tags[1] = 5 (number): expected string, received number",
          '  tags[0] as text "": blank',
          '  tags[1] as text "5": no issue reported',
          HINT,
        ],
        issues: [
          { message: "expected string, received number", path: ["tags", 1] },
        ],
      },
      {
        name: "an issue about a text an earlier round tried, which is not read as decoded",
        ...TAGS,
        // Reads the elements in order and stops at the first that is no
        // string, after a length rule on each string before it.
        searchSchema: createMockSchema({
          validate: (input) => {
            const { tags = [] } = input as {
              readonly tags?: readonly unknown[];
            };
            const issues: StandardSchemaV1Issue[] = [];

            for (const [index, element] of tags.entries()) {
              if (typeof element !== "string") {
                issues.push({
                  message: "expected string",
                  path: ["tags", index],
                });

                break;
              }

              if (element.length < 2) {
                issues.push({ message: "too short", path: ["tags", index] });
              }
            }

            return issues.length > 0 ? { issues } : { value: input };
          },
        }),
        url: "/search?tags[]=1&tags[]=2",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  tags[0] = 1 (number): expected string",
          '  tags[0] as text "1": too short',
          '  tags[1] as text "2": too short',
          HINT,
        ],
        issues: [{ message: "expected string", path: ["tags", 0] }],
      },
      {
        name: "elements named by { key } path segments",
        ...TAGS,
        searchSchema: objectSchema({
          tags: textArray(true, (value) => value.length >= 2),
        }),
        url: "/search?tags[]=ab&tags[]=2",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  tags[1] = 2 (number): expected string, received number",
          '  tags[1] as text "2": too short',
          HINT,
        ],
        issues: [
          {
            message: "expected string, received number",
            path: [{ key: "tags" }, { key: 1 }],
          },
        ],
      },
      {
        name: "a boolean, with its type",
        path: "/search?q",
        searchSchema: objectSchema({ q: text((value) => value.length >= 5) }),
        url: "/search?q=true",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  q = true (boolean): expected string, received boolean",
          '  q as text "true": too short',
          HINT,
        ],
        issues: issue("expected string, received boolean", "q"),
      },
      {
        name: "an issue inside the text, which holds no element",
        path: "/search?q",
        searchSchema: objectSchema({
          q: optional((input, key) =>
            typeof input === "string"
              ? { issues: issue("nested", key, 0) }
              : { issues: issue("expected string", key) },
          ),
        }),
        url: "/search?q=17",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  q = 17 (number): expected string",
          "  q[0] as text is absent: nested",
          HINT,
        ],
        issues: issue("expected string", "q"),
      },
      {
        name: "a key the schema names only once another is text",
        ...STEPS,
        url: "/search?step=2&code=12",
        settled: { search: { step: "2" }, path: "/search?step=2" },
        lines: [
          HEADER,
          "  code = 12 (number): expected string, received number",
          '  code as text "12": too short',
          HINT,
        ],
        issues: issue("expected string, received number", "code"),
      },
      {
        name: "an empty path, zod's form for an issue about the whole query",
        path: "/search?q",
        searchSchema: failingSchema([
          { message: "min must be below max", path: [] },
        ]),
        url: "/search?q=x",
        settled: { search: { q: "x" }, path: "/search?q=x" },
        lines: [
          '[search-schema-plugin] Route "search": the schema rejected these search params:',
          "  the query as a whole: min must be below max — nothing removed",
        ],
        issues: [{ message: "min must be below max", path: [] }],
      },
      {
        name: "an issue inside a key without a value",
        path: "/search?q",
        searchSchema: objectSchema({ q: nested }),
        url: "/search?q",
        settled: { search: {}, path: "/search" },
        lines: [HEADER, "  q[0] is absent: nested"],
        issues: issue("nested", "q", 0),
      },
      {
        name: "elements a schema names one at a time: the decoded query's first, and the last run's",
        ...TAGS,
        searchSchema: oneElementAtATime((value) => value.length >= 2),
        url: "/search?tags[]=11&tags[]=2",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  tags[0] = 11 (number): expected string",
          '  tags[1] as text "2": too short',
          '  tags[0] as text "11": no issue reported',
          HINT,
        ],
        issues: [{ message: "expected string", path: ["tags", 0] }],
      },
      {
        name: "an element a rule does not name, which is not said to pass: the rule may name only its first",
        ...TAGS,
        searchSchema: firstShort,
        url: "/search?tags[]=1&tags[]=2",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  tags[0] = 1 (number): expected string, received number",
          "  tags[1] = 2 (number): expected string, received number",
          '  tags[0] as text "1": too short',
          '  tags[1] as text "2": no issue reported',
          HINT,
        ],
        issues: [
          { message: "expected string, received number", path: ["tags", 0] },
          { message: "expected string, received number", path: ["tags", 1] },
        ],
      },
      {
        name: "an issue inside a number, which is not tried as text",
        path: "/search?q",
        searchSchema: objectSchema({ q: nested }),
        url: "/search?q=17",
        settled: { search: {}, path: "/search" },
        lines: [HEADER, "  q[0] is absent: nested"],
        issues: issue("nested", "q", 0),
      },
      {
        name: "a key whose text fails while a later round tries another",
        path: "/search?q&b",
        // `q` must be text of three characters or more; `b` is read only once
        // `q` is text.
        searchSchema: createMockSchema({
          validate: (input) => {
            const { q, b } = input as {
              readonly q?: unknown;
              readonly b?: unknown;
            };

            if (typeof q !== "string") {
              return {
                issues: issue(`expected string, received ${typeof q}`, "q"),
              };
            }

            const issues: StandardSchemaV1Issue[] = [];

            if (q.length < 3) {
              issues.push(...issue("too short", "q"));
            }

            if (b !== undefined && typeof b !== "string") {
              issues.push(...issue("b must be text", "b"));
            }

            return issues.length > 0 ? { issues } : { value: { q, b } };
          },
        }),
        url: "/search?q=17&b=2",
        settled: { search: { b: "2" }, path: "/search?b=2" },
        lines: [
          HEADER,
          "  q = 17 (number): expected string, received number",
          '  q as text "17": too short',
          HINT,
        ],
        issues: issue("expected string, received number", "q"),
      },
      {
        name: "an issue inside a string, which holds no element",
        path: "/search?q",
        searchSchema: failingSchema(issue("nested", "q", 0)),
        url: "/search?q=ab",
        settled: { search: {}, path: "/search" },
        lines: [HEADER, "  q[0] is absent: nested"],
        issues: issue("nested", "q", 0),
      },
      {
        name: "an issue inside an array element, which holds nothing",
        ...TAGS,
        searchSchema: failingSchema(issue("nested", "tags", 0, "x")),
        url: "/search?tags[]=1",
        settled: { search: {}, path: "/search" },
        lines: [HEADER, "  tags[0][x] is absent: nested"],
        issues: issue("nested", "tags", 0, "x"),
      },
      {
        name: "an element named by a string, which is not read as an index",
        ...TAGS,
        searchSchema: failingSchema(issue("rejected", "tags", "1")),
        url: "/search?tags[]=a&tags[]=1",
        settled: { search: {}, path: "/search" },
        lines: [HEADER, "  tags[1] = 1 (number): rejected", HINT],
        issues: issue("rejected", "tags", "1"),
      },
      {
        name: "a value the schema wraps in an array once it is text",
        path: "/search?q",
        // A `z.preprocess` that writes into its input, over a text field.
        searchSchema: createMockSchema({
          validate: (input) => {
            const bag = input as Record<string, unknown>;

            if (typeof bag.q === "string") {
              bag.q = [bag.q];
            }

            return bag.q === undefined
              ? { value: bag }
              : { issues: issue("expected string", "q") };
          },
        }),
        url: "/search?q=17",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  q = 17 (number): expected string",
          "  q as text (array): expected string",
          HINT,
        ],
        issues: issue("expected string", "q"),
      },
      {
        name: "an array the schema joins into text once its elements are text",
        ...TAGS,
        // A `z.preprocess` that writes into its input, over an array field.
        searchSchema: createMockSchema({
          validate: (input) => {
            const bag = input as Record<string, unknown>;
            const { tags } = bag;

            if (
              Array.isArray(tags) &&
              tags.every((tag) => typeof tag === "string")
            ) {
              bag.tags = tags.join(",");
            }

            if (bag.tags === undefined) {
              return { value: bag };
            }

            return Array.isArray(bag.tags)
              ? { issues: issue("expected string", "tags", 0) }
              : { issues: issue("expected array", "tags") };
          },
        }),
        url: "/search?tags[]=1",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  tags[0] = 1 (number): expected string",
          '  tags as text "1": expected array',
          HINT,
        ],
        issues: issue("expected string", "tags", 0),
      },
      {
        name: "a null path segment, outside the spec, shown as itself",
        ...TAGS,
        searchSchema: createMockSchema({
          validate: (input) =>
            (input as { readonly tags?: unknown }).tags === undefined
              ? { value: input }
              : { issues: NULL_SEGMENT },
        }),
        url: "/search?tags[]=a",
        settled: { search: {}, path: "/search" },
        lines: [HEADER, "  tags[null] is absent: bad"],
        issues: NULL_SEGMENT,
      },
      {
        name: "a path given as a string, outside the spec, read as Array.from reads it",
        path: "/search?q",
        searchSchema: failingSchema(STRING_PATH),
        url: "/search?q=x",
        settled: { search: {}, path: "/search" },
        lines: [HEADER, '  q = "x": bad'],
        issues: STRING_PATH,
      },
      {
        name: "a path given as an array-like object, outside the spec, read by index",
        path: "/search?q",
        searchSchema: failingSchema(ARRAY_LIKE_PATH),
        url: "/search?q=x",
        settled: { search: {}, path: "/search" },
        lines: [HEADER, '  q = "x": bad'],
        issues: ARRAY_LIKE_PATH,
      },
      {
        name: "a path without a length, outside the spec, read as no path",
        path: "/search?q",
        searchSchema: failingSchema(LENGTHLESS_PATH),
        url: "/search?q=x",
        settled: { search: { q: "x" }, path: "/search?q=x" },
        lines: [
          '[search-schema-plugin] Route "search": the schema rejected these search params:',
          "  the query as a whole: bad — nothing removed",
        ],
        issues: LENGTHLESS_PATH,
      },
      {
        name: "a segment that is an object without key, outside the spec, read as itself",
        path: "/search?q",
        searchSchema: failingSchema(KEYLESS_SEGMENT),
        url: "/search?q=x",
        settled: { search: {}, path: "/search" },
        lines: [HEADER, '  q = "x": bad'],
        issues: KEYLESS_SEGMENT,
      },
      {
        name: "a key the text fixes, rejected on the query the runs settle on, shown as text",
        path: "/search?q&page",
        searchSchema: refined({ q: text(), page: positive }, (bag) =>
          typeof bag.q === "string" && bag.q.length < 3
            ? issue("too short", "q")
            : [],
        ),
        url: "/search?q=17&page=0",
        settled: { search: {}, path: "/search" },
        lines: [
          HEADER,
          "  page = 0 (number): too small",
          '  page as text "0": expected number, received string',
          '  q = "17": too short',
          HINT,
        ],
        issues: [...issue("too small", "page"), ...issue("too short", "q")],
      },
    ])("$name", async (report) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        settle({ ...report, mode: "development" }, report.url),
      ).resolves.toStrictEqual(report.settled);
      expect(error.mock.calls).toStrictEqual([
        [report.lines.join("\n"), report.issues],
      ]);
    });

    it("an object navigate() passes, by its type alone", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const router = routerFor({ ...SEARCH, mode: "development" }, undefined);

      await router.start("/");

      const state = await router.navigate(
        "search",
        {},
        { q: { nested: "x" } as unknown as string },
      );

      router.stop();

      expect(state.search).toStrictEqual({});
      expect(error.mock.calls).toStrictEqual([
        [
          [HEADER, "  q = (object): expected string, received object"].join(
            "\n",
          ),
          issue("expected string, received object", "q"),
        ],
      ]);
    });

    it("a value the query only inherits, which is shown as absent and never tried as text", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      // The schema reads `bag.q` as zod does, so it sees the number; the query
      // holds no `q` of its own.
      Object.defineProperty(Object.prototype, "q", {
        value: 17,
        configurable: true,
        writable: true,
      });

      let settled: Settled;

      try {
        settled = await settle({ ...SEARCH, mode: "development" }, "/search");
      } finally {
        Reflect.deleteProperty(Object.prototype, "q");
      }

      expect(settled).toStrictEqual({ search: {}, path: "/search" });
      expect(error.mock.calls).toStrictEqual([
        [
          [HEADER, "  q is absent: expected string, received number"].join(
            "\n",
          ),
          issue("expected string, received number", "q"),
        ],
      ]);
    });
  });

  describe("onError is handed what is left once the text is tried", () => {
    it("is not called when the text fixes every rejected value", async () => {
      const onError = vi.fn(() => ({}));

      await expect(
        settle({ ...SEARCH, onError }, "/search?q=17"),
      ).resolves.toStrictEqual({ search: { q: "17" }, path: "/search?q=17" });
      expect(onError).not.toHaveBeenCalled();
    });

    it("gets the fixed key as text, and only the other key's issues", async () => {
      const onError = vi.fn(() => ({ q: "kept" }));

      await expect(
        settle({ ...SEARCH, onError }, "/search?q=17&page=0"),
      ).resolves.toStrictEqual({
        search: { q: "kept" },
        path: "/search?q=kept",
      });
      expect(onError.mock.calls).toStrictEqual([
        ["search", { q: "17", page: 0 }, issue("too small", "page")],
      ]);
    });

    it("gets the schema's issues on the query it is handed: the decoded query's, when the text fixed no key", async () => {
      const onError = vi.fn(() => ({}));

      await settle(
        { ...TAGS, searchSchema: blankless, onError },
        "/search?tags[]=&tags[]=5",
      );

      expect(onError.mock.calls).toStrictEqual([
        [
          "search",
          { tags: ["", 5] },
          [{ message: "expected string, received number", path: ["tags", 1] }],
        ],
      ]);
    });
  });

  describe("the issues are the schema's on the query the text runs settle on", () => {
    // `to` must not precede `from`: a rule a range issue does not stop, and the
    // text of a rejected `page` — a type issue — does.
    const dateRange = refined(
      { q: text(), page: positive, from: text(), to: text() },
      ({ from, to }) =>
        typeof from === "string" && typeof to === "string" && to < from
          ? issue("to precedes from", "to")
          : [],
    );
    const RANGE: Setup = {
      path: "/search?q&page&from&to",
      searchSchema: dateRange,
      defaultSearch: { page: 1 },
    };

    it("a rule the text of a number never reaches still strips the key it names, as in the decoded query", async () => {
      await expect(
        settle(RANGE, "/search?page=0&from=b&to=a"),
      ).resolves.toStrictEqual({
        search: { page: 1, from: "b" },
        path: "/search?page=1&from=b",
      });
    });

    it("onError gets a rule without a path that only the decoded query reaches", async () => {
      const onError = vi.fn(() => ({}));
      const minMax = refined(
        { min: positive, max: positive },
        ({ min, max }) =>
          typeof min === "number" && typeof max === "number" && min > max
            ? [{ message: "min above max" }]
            : [],
      );

      await settle(
        { path: "/search?min&max", searchSchema: minMax, onError },
        "/search?min=-1&max=-5",
      );

      expect(onError.mock.calls).toStrictEqual([
        [
          "search",
          { min: -1, max: -5 },
          [
            ...issue("too small", "min"),
            ...issue("too small", "max"),
            { message: "min above max" },
          ],
        ],
      ]);
    });

    it("onError gets a rule about the whole array that only the decoded query reaches", async () => {
      const onError = vi.fn(() => ({}));
      const atMostTwo = refined({ tags: positives }, ({ tags }) =>
        Array.isArray(tags) && tags.length > 2
          ? issue("at most two", "tags")
          : [],
      );

      await settle(
        { ...TAGS, searchSchema: atMostTwo, onError },
        "/search?tags[]=-1&tags[]=2&tags[]=3",
      );

      expect(onError.mock.calls).toStrictEqual([
        [
          "search",
          { tags: [-1, 2, 3] },
          [...issue("too small", "tags", 0), ...issue("at most two", "tags")],
        ],
      ]);
    });

    it("a key the text fixes next to one it does not: the query settled on gets a run of its own, which the repair goes by", async () => {
      await expect(
        settle(RANGE, "/search?q=17&page=0&from=b&to=a"),
      ).resolves.toStrictEqual({
        search: { q: "17", page: 1, from: "b" },
        path: "/search?q=17&page=1&from=b",
      });
    });

    it("onError gets that run's issues: the schema's on the params it gets", async () => {
      const onError = vi.fn(() => ({}));

      await settle({ ...RANGE, onError }, "/search?q=17&page=0&from=b&to=a");

      const params = { q: "17", page: 0, from: "b", to: "a" };
      const issues = [
        ...issue("too small", "page"),
        ...issue("to precedes from", "to"),
      ];

      expect(onError.mock.calls).toStrictEqual([["search", params, issues]]);
      expect(dateRange["~standard"].validate(params)).toStrictEqual({ issues });
    });

    it("the query settled on can pass, and is then kept", async () => {
      // `n` must be text while `q` is a number, and a number once `q` is text;
      // the output leaves `n` out, so outside `strict` it comes from the query
      // the schema judged.
      const acrossKeys = createMockSchema({
        validate: (input) => {
          const { q, n } = input as {
            readonly q?: unknown;
            readonly n?: unknown;
          };
          const form = typeof q === "string" ? "number" : "string";
          const issues = [
            ...(typeof q === "string" ? [] : issue("expected string", "q")),
            ...(typeof n === form ? [] : issue("n in the wrong form", "n")),
          ];

          return issues.length > 0 ? { issues } : { value: { q } };
        },
      });

      await expect(
        settle(
          { path: "/search?q&n", searchSchema: acrossKeys },
          "/search?q=17&n=5",
        ),
      ).resolves.toStrictEqual({
        search: { q: "17", n: 5 },
        path: "/search?q=17&n=5",
      });
    });
  });

  describe('a rule about the whole query judges the text once the text fixes the key, as under "none"', () => {
    const WHOLE: Setup = { path: "/search?q", searchSchema: wholeQuery };
    const ISSUES: Issues = [{ message: "q is too short" }];

    it.each([
      { name: '"none"', formats: NONE },
      { name: "the default formats", formats: undefined },
    ])(
      "is reported, and nothing is removed, under $name",
      async ({ formats }) => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(
          settle({ ...WHOLE, mode: "development" }, "/search?q=17", formats),
        ).resolves.toStrictEqual({ search: { q: "17" }, path: "/search?q=17" });
        expect(error.mock.calls).toStrictEqual([
          [
            [
              '[search-schema-plugin] Route "search": the schema rejected these search params:',
              "  the query as a whole: q is too short — nothing removed",
            ].join("\n"),
            ISSUES,
          ],
        ]);
      },
    );

    it.each([
      { name: '"none"', formats: NONE },
      { name: "the default formats", formats: undefined },
    ])(
      "is handed to onError with the text, under $name",
      async ({ formats }) => {
        const onError = vi.fn(() => ({}));

        await settle({ ...WHOLE, onError }, "/search?q=17", formats);

        expect(onError.mock.calls).toStrictEqual([
          ["search", { q: "17" }, ISSUES],
        ]);
      },
    );
  });

  describe("a caller's array is read, never written", () => {
    async function navigateTags(
      tags: unknown,
      searchSchema = TAGS.searchSchema,
    ): Promise<SearchParams> {
      const router = routerFor({ ...TAGS, searchSchema }, undefined);

      await router.start("/");

      const state = await router.navigate("search", {}, {
        tags,
      } as SearchParams);

      router.stop();

      return state.search;
    }

    it("a frozen array", async () => {
      await expect(
        navigateTags(Object.freeze([17, "a"])),
      ).resolves.toStrictEqual({ tags: ["17", "a"] });
    });

    it("a plain array keeps its own elements", async () => {
      const tags = [true, "a"];

      await expect(navigateTags(tags)).resolves.toStrictEqual({
        tags: ["true", "a"],
      });
      expect(tags).toStrictEqual([true, "a"]);
    });

    it("a NaN element, whose text is String(NaN)", async () => {
      await expect(navigateTags([Number.NaN, "a"])).resolves.toStrictEqual({
        tags: ["NaN", "a"],
      });
    });

    it("a pass-through Proxy, as a reactive store hands one over", async () => {
      await expect(
        navigateTags(new Proxy([17, "a"], {})),
      ).resolves.toStrictEqual({ tags: ["17", "a"] });
    });

    it("an element behind a getter lands as a text the schema accepted", async () => {
      let reads = 0;
      const tags: unknown[] = ["a"];

      Object.defineProperty(tags, 1, {
        enumerable: true,
        get: () => {
          reads += 1;

          return reads === 1 ? 17 : 17 + reads;
        },
      });

      const accepted: unknown[] = [];
      const inner = TAGS.searchSchema["~standard"];
      const recording = createMockSchema({
        validate: (input) => {
          const result = inner.validate(input) as StandardSchemaV1Result;

          if ("value" in result) {
            accepted.push(structuredClone(input));
          }

          return result;
        },
      });

      const search = await navigateTags(tags, recording);

      expect(reads).toBeGreaterThan(1);
      expect(search).toStrictEqual({ tags: ["a", expect.any(String)] });
      expect(accepted).toContainEqual(search);
    });
  });

  describe("a rejection costs in proportion to its issues", () => {
    /**
     * The most reads of `path` any one issue takes, in `mode: "development"`,
     * when the schema rejects each of `count` numeric elements and then each
     * element's text.
     */
    async function readsPerIssue(count: number): Promise<number> {
      const reads: number[] = [];
      const counted = (
        message: string,
        index: number,
      ): StandardSchemaV1Issue => {
        const slot = reads.push(0) - 1;
        const path = ["tags", index];

        return {
          message,
          get path() {
            reads[slot] += 1;

            return path;
          },
        };
      };
      const schema = createMockSchema({
        validate: (input) => {
          const { tags = [] } = input as {
            readonly tags?: readonly unknown[];
          };
          const issues = tags.map((element, index) =>
            counted(
              typeof element === "string" ? "too short" : "expected string",
              index,
            ),
          );

          return issues.length > 0 ? { issues } : { value: input };
        },
      });
      const url = `/search?${Array.from(
        { length: count },
        (_, index) => `tags[]=${index}`,
      ).join("&")}`;

      vi.spyOn(console, "error").mockImplementation(() => {});

      await settle({ ...TAGS, searchSchema: schema, mode: "development" }, url);

      return Math.max(...reads);
    }

    it("each issue is read as often for 200 elements as for 50", async () => {
      await expect(readsPerIssue(200)).resolves.toBe(await readsPerIssue(50));
    });
  });

  describe("a value whose text the schema rejects too is repaired as before", () => {
    it.each<Cell>([
      {
        name: "a text rule the number's text breaks",
        path: "/search?q",
        searchSchema: objectSchema({ q: text((value) => value.length >= 3) }),
        url: "/search?q=17",
        expected: { search: {}, path: "/search" },
      },
      {
        name: "a number field",
        ...SEARCH,
        url: "/search?page=0",
        expected: { search: {}, path: "/search" },
      },
      {
        name: "an issue inside a number, which holds no element",
        path: "/search?q",
        searchSchema: objectSchema({ q: nested }),
        url: "/search?q=17",
        expected: { search: {}, path: "/search" },
      },
    ])("$name", async (cell) => {
      await expect(settle(cell, cell.url)).resolves.toStrictEqual(
        cell.expected,
      );
    });
  });
});
