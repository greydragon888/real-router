import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { searchSchemaPlugin } from "@real-router/search-schema-plugin";

import type { Route, Router, SearchParams } from "@real-router/core";
import type {
  SearchSchemaPluginOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
  StandardSchemaV1Result,
} from "@real-router/search-schema-plugin";

/**
 * Standard Schema decides a run by `issues` — "A falsy value for `issues`
 * indicates success" — so a failure may carry `value` as well, and a success
 * may spell `issues: undefined` (#2851). The tables over `SHAPES` run one
 * schema in each spelling a library uses, zod's as the control.
 */

/**
 * - `zod`: `{ value }` on success, `{ issues }` on failure — zod 4; ArkType 2
 *   answers a success so, and its failure is one of `FORMS` below;
 * - `valibot`: `{ value, typed }` on success and `{ value, typed, issues }` on
 *   failure, its `value` the query parsed so far, each rejected key as handed
 *   in, and an issue's path made of `{ key }` segments — valibot 1.4 and 1.5;
 * - `spec`: `{ value, issues: undefined }` on success.
 */
const SHAPES = ["zod", "valibot", "spec"] as const;

type Shape = (typeof SHAPES)[number];

/** What one declared key parses to: its output, an issue about it, or nothing. */
type FieldResult =
  { readonly value: unknown } | { readonly issue: string } | undefined;

type Field = (input: unknown) => FieldResult;

/**
 * An object schema answering in `shape`: each declared key runs its field, an
 * undeclared key is left out of the output, and an issue names its key.
 */
function objectSchema(
  fields: Readonly<Record<string, Field>>,
  shape: Shape,
): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: shape,
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
            issues.push({
              message: result.issue,
              path: shape === "valibot" ? [{ key }] : [key],
            });
            output[key] = bag[key];
          } else {
            output[key] = result.value;
          }
        }

        return answer(shape, output, issues);
      },
    },
  };
}

function answer(
  shape: Shape,
  output: Readonly<Record<string, unknown>>,
  issues: readonly StandardSchemaV1Issue[],
): StandardSchemaV1Result {
  const failed = issues.length > 0;
  const spelled = {
    zod: failed ? { issues } : { value: output },
    valibot: failed
      ? { value: output, typed: false, issues }
      : { value: output, typed: true },
    spec: failed ? { issues } : { value: output, issues: undefined },
  };

  return spelled[shape];
}

const number: Field = (input) =>
  typeof input === "number" ? { value: input } : { issue: "expected number" };

const text =
  (minLength = 0, transform = (value: string) => value): Field =>
  (input) => {
    if (typeof input !== "string") {
      return { issue: `expected string, received ${typeof input}` };
    }

    return input.length < minLength
      ? { issue: "too short" }
      : { value: transform(input) };
  };

const optional =
  (parse: Field): Field =>
  (input) =>
    input === undefined ? undefined : parse(input);

/** A schema that answers `result` on every run, whatever it is handed. */
function answering(result: unknown): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: () => result as StandardSchemaV1Result,
    },
  };
}

/** A schema that answers each run with the next of `results`, and the last one from then on. */
function answeringInTurn(
  ...results: readonly (() => unknown)[]
): StandardSchemaV1 {
  let calls = 0;

  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: () => {
        const next = results[Math.min(calls, results.length - 1)];

        calls += 1;

        return next() as StandardSchemaV1Result;
      },
    },
  };
}

let router: Router | undefined;

function setUp(route: Route, options?: SearchSchemaPluginOptions): Router {
  router = createRouter([{ name: "home", path: "/" }, route]);
  router.usePlugin(searchSchemaPlugin(options ?? { mode: "production" }));

  return router;
}

/** What `act` throws, or `undefined`. */
function thrownBy(act: () => unknown): unknown {
  try {
    act();
  } catch (error) {
    return error;
  }

  return undefined;
}

/** The plugin's own calls of a spied `console` method — core logs some failures as well. */
function pluginCalls(spy: { mock: { calls: unknown[][] } }): unknown[][] {
  return spy.mock.calls.filter(([message]) =>
    String(message).startsWith("[search-schema-plugin]"),
  );
}

/**
 * Runs `action` with Node's `unhandledRejection` listeners swapped for a
 * recorder, and answers what it recorded once a macrotask has let them fire —
 * waited for even when `action` throws, so no rejection outlives its cell.
 */
async function unhandledDuring(
  action: () => Promise<void> | void,
): Promise<unknown[]> {
  const recorded: unknown[] = [];
  const previous = process.listeners("unhandledRejection");
  const record = (reason: unknown): void => {
    recorded.push(reason);
  };

  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", record);

  try {
    await action();
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off("unhandledRejection", record);

    for (const listener of previous) {
      process.on("unhandledRejection", listener);
    }
  }

  return recorded;
}

/**
 * `q` comes out upper-cased: a state holding `"X"` holds the output of the
 * repair's run, which each spelling answers as a success.
 */
const PAGING = (shape: Shape): Route => ({
  name: "s",
  path: "/s?page&q",
  defaultSearch: { page: 1 },
  searchSchema: objectSchema(
    { page: number, q: optional(text(0, (value) => value.toUpperCase())) },
    shape,
  ),
});

const REJECTED = { page: "abc", q: "x" };

describe("search-schema-plugin reads ~standard.validate as Standard Schema does (#2851)", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
    vi.restoreAllMocks();
  });

  describe("a run the schema rejects reads as rejected in every spelling (#2851)", () => {
    describe.each(SHAPES)("%s", (shape) => {
      it("start(url): the rejected key takes its defaultSearch value", async () => {
        const state = await setUp(PAGING(shape)).start("/s?page=abc&q=x");

        expect(state.search).toStrictEqual({ page: 1, q: "X" });
        expect(state.path).toBe("/s?page=1&q=X");
      });

      it("navigate: the rejected key takes its defaultSearch value", async () => {
        const app = setUp(PAGING(shape));

        await app.start("/");

        const state = await app.navigate("s", {}, REJECTED);

        expect(state.search).toStrictEqual({ page: 1, q: "X" });
      });

      it("buildPath: the rejected key takes its defaultSearch value", () => {
        expect(setUp(PAGING(shape)).buildPath("s", {}, REJECTED)).toBe(
          "/s?page=1&q=X",
        );
      });

      it('mode "development" logs the rejection once', async () => {
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});

        await setUp(PAGING(shape), { mode: "development" }).start(
          "/s?page=abc&q=x",
        );

        expect(pluginCalls(errors)).toHaveLength(1);
      });

      it("onError is called with the rejected query", async () => {
        const onError = vi.fn((_route: string, params: SearchParams) => ({
          ...params,
          page: 1,
        }));

        await setUp(PAGING(shape), { onError }).start("/s?page=abc&q=x");

        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(
          "s",
          REJECTED,
          expect.arrayContaining([
            expect.objectContaining({ message: "expected number" }),
          ]),
        );
      });

      it("a text run the schema rejects: the key is dropped", async () => {
        // `?q=17` decodes to 17; its text "17" is tried and is too short.
        const state = await setUp({
          name: "t",
          path: "/t?q",
          searchSchema: objectSchema({ q: optional(text(3)) }, shape),
        }).start("/t?q=17");

        expect(state.search).toStrictEqual({});
        expect(state.path).toBe("/t");
      });

      it("a settled query the schema rejects: only the key its text fixed stays", async () => {
        // `a` passes as text and `b` does not, so `{ a: "17", b: 17 }` is run.
        const state = await setUp({
          name: "u",
          path: "/u?a&b",
          searchSchema: objectSchema(
            { a: optional(text()), b: optional(text(3)) },
            shape,
          ),
        }).start("/u?a=17&b=17");

        expect(state.search).toStrictEqual({ a: "17" });
      });

      it("a repaired query the schema rejects is written back as the repair built it", async () => {
        // `n`'s default is rejected too; `t` would come out upper-cased.
        const app = setUp({
          name: "r",
          path: "/r?n&t",
          defaultSearch: { n: "bad" },
          searchSchema: objectSchema(
            {
              n: optional(number),
              t: optional(text(0, (v) => v.toUpperCase())),
            },
            shape,
          ),
        });

        await app.start("/");

        const state = await app.navigate("r", {}, { n: "abc", t: "ab" });

        expect(state.search).toStrictEqual({ n: "bad", t: "ab" });
      });
    });
  });

  describe("the defaultSearch check reads a run as the pipeline does (#2851)", () => {
    describe.each(SHAPES)("%s", (shape) => {
      it("a default the schema accepts draws no warning", () => {
        const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});

        setUp(
          {
            name: "s",
            path: "/s?page",
            defaultSearch: { page: 1 },
            searchSchema: objectSchema({ page: number }, shape),
          },
          { mode: "development" },
        );

        expect(warnings).not.toHaveBeenCalled();
      });

      it("a default the schema rejects draws one warning (control)", () => {
        const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});

        setUp(
          {
            name: "s",
            path: "/s?page",
            defaultSearch: { page: "one" },
            searchSchema: objectSchema({ page: number }, shape),
          },
          { mode: "development" },
        );

        expect(warnings).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("an answer that is not a Standard Schema result is refused (#2851)", () => {
    const NON_RESULT =
      '[search-schema-plugin] Route "s": ~standard.validate() answered with no issues and no "value", which is not a Standard Schema result.';

    it.each([
      ["an object with neither value nor issues", {}],
      // eslint-disable-next-line unicorn/no-thenable -- a thenable that is not a Promise is the answer under test
      ["a thenable that is not a Promise", { then: () => {} }],
    ])("%s", async (_title, result) => {
      const app = setUp({
        name: "s",
        path: "/s?q",
        searchSchema: answering(result),
      });

      await app.start("/");

      const navigation = app.navigate("s", {}, { q: "x" });

      await expect(navigation).rejects.toBeInstanceOf(TypeError);
      await expect(navigation).rejects.toHaveProperty("message", NON_RESULT);
    });

    it('the defaultSearch check refuses it too: usePlugin throws in mode "development"', () => {
      const route = {
        name: "s",
        path: "/s?q",
        defaultSearch: { q: "x" },
        searchSchema: answering({}),
      };
      const refusal = thrownBy(() => setUp(route, { mode: "development" }));

      expect(refusal).toBeInstanceOf(TypeError);
      expect(refusal).toHaveProperty("message", NON_RESULT);
      expect(() => setUp(route, { mode: "production" })).not.toThrow();
    });

    it("an answer whose issues are an empty array is a rejection: its value is not written", async () => {
      // `issues: []` is not falsy, so Standard Schema reads it as a failure.
      const state = await setUp({
        name: "s",
        path: "/s?page",
        searchSchema: answering({ value: { page: 2 }, issues: [] }),
      }).start("/s?page=x");

      expect(state.search).toStrictEqual({ page: "x" });
    });
  });

  /** Forms of one answer; ArkType's failure is an array whose `issues` it inherits. */
  const FORMS: readonly (readonly [
    form: string,
    wrap: (answer: Readonly<Record<string, unknown>>) => object,
  ])[] = [
    ["own enumerable (control)", (answer) => ({ ...answer })],
    [
      "inherited through the prototype, as ArkType's failure is",
      (answer) => Object.create(answer) as object,
    ],
    [
      "own non-enumerable",
      (answer) =>
        Object.defineProperties(
          {},
          Object.fromEntries(
            Object.entries(answer).map(([key, value]) => [
              key,
              { value, enumerable: false },
            ]),
          ),
        ),
    ],
    ["pass-through Proxy", (answer) => new Proxy({ ...answer }, {})],
    [
      "null-prototype",
      (answer) => Object.assign(Object.create(null) as object, answer),
    ],
  ];

  describe("an answer reads the same in each form it arrives in (#2851)", () => {
    it.each(FORMS)("%s", async (_form, wrap) => {
      const app = setUp({
        name: "s",
        path: "/s?page",
        defaultSearch: { page: 1 },
        searchSchema: {
          "~standard": {
            version: 1,
            vendor: "test",
            validate: (input) => {
              const { page } = input as { readonly page?: unknown };

              return wrap(
                typeof page === "number"
                  ? { value: { page: page + 1 } }
                  : {
                      issues: [{ message: "expected number", path: ["page"] }],
                    },
              ) as StandardSchemaV1Result;
            },
          },
        },
      });

      await app.start("/s?page=5");

      expect(app.getState()?.search).toStrictEqual({ page: 6 });

      await app.navigate("s", {}, { page: "abc" });

      // Rejected: the key takes its default, which the repair's run accepts.
      expect(app.getState()?.search).toStrictEqual({ page: 2 });
    });
  });

  const ASYNC_REFUSAL =
    '[search-schema-plugin] Async schema validation is not supported. Route "s" returned a Promise from ~standard.validate().';

  /** The line the plugin logs with the error a rejected Promise carries. */
  const threwOn = (route: string, subject: string): string =>
    `[search-schema-plugin] Route "${route}": the schema threw on ${subject} — ~standard.validate() answered with a rejected Promise, as zod does when a transform or a refinement throws.`;

  /** What zod answers with when a transform or a refinement throws. */
  const thrown = () => new SyntaxError("Unexpected token in JSON");

  describe("a Promise the schema answers with is refused and handled (#2851)", () => {
    it("the recorder sees a rejection nobody handles (control)", async () => {
      const error = new Error("nobody handles this");

      const unhandled = await unhandledDuring(() => {
        void Promise.reject(error);
      });

      expect(unhandled).toStrictEqual([error]);
    });

    it("the refusal says zod answers a throw with a rejected Promise, and when the plugin logs it", async () => {
      const app = setUp({
        name: "s",
        path: "/s?q",
        searchSchema: answeringInTurn(() => Promise.reject(thrown())),
      });

      await app.start("/");

      // The window only keeps the rejection inside this cell; the cells below
      // pin what becomes of it.
      await unhandledDuring(async () => {
        await expect(app.navigate("s", {}, { q: "x" })).rejects.toHaveProperty(
          "message",
          `${ASYNC_REFUSAL} zod answers with a rejected Promise when a transform or a refinement throws; in mode "development" without onError, the plugin logs that error.`,
        );
      });
    });

    // A text run follows a rejected number; the settled run, a text that fixed
    // one rejected key of two; the repair, a rejected text.
    it.each([
      {
        run: "the first run",
        path: "/s?q",
        search: { q: "x" },
        schema: () => answeringInTurn(() => Promise.reject(thrown())),
      },
      {
        run: "a text run",
        path: "/s?q",
        search: { q: 17 },
        schema: () =>
          answeringInTurn(
            () => ({ issues: [{ message: "expected string", path: ["q"] }] }),
            () => Promise.reject(thrown()),
          ),
      },
      {
        run: "the settled run",
        path: "/s?a&b",
        search: { a: 17, b: 17 },
        schema: () =>
          answeringInTurn(
            () => ({
              issues: [
                { message: "expected string", path: ["a"] },
                { message: "expected string", path: ["b"] },
              ],
            }),
            // `a` passes as text and `b` does not, so `{ a: "17", b: 17 }` is run.
            () => ({ issues: [{ message: "too short", path: ["b"] }] }),
            () => Promise.reject(thrown()),
          ),
      },
      {
        run: "the repair's run",
        path: "/s?q",
        search: { q: "x" },
        schema: () =>
          answeringInTurn(
            () => ({ issues: [{ message: "invalid", path: ["q"] }] }),
            () => Promise.reject(thrown()),
          ),
      },
    ])(
      '$run: the navigation is refused, nothing is left unhandled, and mode "development" logs the schema\'s error',
      async ({ path, search, schema }) => {
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        const app = setUp(
          { name: "s", path, searchSchema: schema() },
          { mode: "development" },
        );

        await app.start("/");

        const unhandled = await unhandledDuring(async () => {
          await expect(app.navigate("s", {}, search)).rejects.toThrow(
            ASYNC_REFUSAL,
          );
        });

        expect(unhandled).toStrictEqual([]);
        expect(pluginCalls(errors).at(-1)).toStrictEqual([
          threwOn("s", "the query"),
          expect.objectContaining({ name: "SyntaxError" }),
        ]);
      },
    );

    it('mode "production": nothing is left unhandled and nothing is logged', async () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const app = setUp({
        name: "s",
        path: "/s?q",
        searchSchema: answeringInTurn(() => Promise.reject(thrown())),
      });

      await app.start("/");

      const unhandled = await unhandledDuring(async () => {
        await expect(app.navigate("s", {}, { q: "x" })).rejects.toThrow(
          ASYNC_REFUSAL,
        );
      });

      expect(unhandled).toStrictEqual([]);
      expect(pluginCalls(errors)).toStrictEqual([]);
    });

    it("onError is set: nothing is left unhandled and the plugin logs nothing, as for rejected search params", async () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const onError = vi.fn((_route: string, params: SearchParams) => params);
      const app = setUp(
        {
          name: "s",
          path: "/s?q",
          searchSchema: answeringInTurn(() => Promise.reject(thrown())),
        },
        { mode: "development", onError },
      );

      await app.start("/");

      const unhandled = await unhandledDuring(async () => {
        await expect(app.navigate("s", {}, { q: "x" })).rejects.toThrow(
          ASYNC_REFUSAL,
        );
      });

      expect(unhandled).toStrictEqual([]);
      expect(pluginCalls(errors)).toStrictEqual([]);
      expect(onError).not.toHaveBeenCalled();
    });

    it("a Promise that resolves is refused and logs nothing (control)", async () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const app = setUp(
        {
          name: "s",
          path: "/s?q",
          searchSchema: answeringInTurn(() => Promise.resolve({ value: {} })),
        },
        { mode: "development" },
      );

      await app.start("/");

      // Waited for, so a log in the Promise's reaction would be seen.
      await unhandledDuring(async () => {
        await expect(app.navigate("s", {}, { q: "x" })).rejects.toThrow(
          ASYNC_REFUSAL,
        );
      });

      expect(pluginCalls(errors)).toStrictEqual([]);
    });
  });

  describe("the defaultSearch check handles a Promise (#2851)", () => {
    const throwing = () => answeringInTurn(() => Promise.reject(thrown()));
    const throwingOnDefault = (name: string): Route => ({
      name,
      path: `/${name}?q`,
      defaultSearch: { q: "x" },
      searchSchema: throwing(),
    });

    // The check warns, as it does about a default the schema rejects.
    it.each([
      {
        door: "usePlugin",
        route: "s",
        act: () => {
          setUp(throwingOnDefault("s"), { mode: "development" });
        },
      },
      {
        door: "usePlugin with onError",
        route: "s",
        act: () => {
          setUp(throwingOnDefault("s"), {
            mode: "development",
            onError: (_route, params) => params,
          });
        },
      },
      {
        door: "getRoutesApi().add",
        route: "a",
        act: () => {
          getRoutesApi(
            setUp({ name: "s", path: "/s?q" }, { mode: "development" }),
          ).add(throwingOnDefault("a"));
        },
      },
      {
        door: "getRoutesApi().replace",
        route: "a",
        act: () => {
          getRoutesApi(
            setUp({ name: "s", path: "/s?q" }, { mode: "development" }),
          ).replace([{ name: "home", path: "/" }, throwingOnDefault("a")]);
        },
      },
      {
        door: "getRoutesApi().update",
        route: "s",
        act: () => {
          getRoutesApi(
            setUp(
              { name: "s", path: "/s?q", searchSchema: throwing() },
              { mode: "development" },
            ),
          ).update("s", { defaultSearch: { q: "x" } });
        },
      },
    ])(
      "$door: the schema's error is a warning, nothing is left unhandled",
      async ({ route, act }) => {
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});

        const unhandled = await unhandledDuring(act);

        expect(unhandled).toStrictEqual([]);
        expect(pluginCalls(warnings)).toStrictEqual([
          [
            threwOn(route, "defaultSearch"),
            expect.objectContaining({ name: "SyntaxError" }),
          ],
        ]);
        expect(pluginCalls(errors)).toStrictEqual([]);
      },
    );

    it("a Promise that resolves draws no warning, once it has settled (control)", async () => {
      const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Waited for, so a warning in the Promise's reaction would be seen.
      await unhandledDuring(() => {
        setUp(
          {
            name: "s",
            path: "/s?q",
            defaultSearch: { q: "x" },
            searchSchema: answeringInTurn(() =>
              Promise.resolve({ value: { q: "x" } }),
            ),
          },
          { mode: "development" },
        );
      });

      expect(pluginCalls(warnings)).toStrictEqual([]);
    });
  });
});
