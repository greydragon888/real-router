import { fc, test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { buildParamMeta } from "@real-router/core/validation";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import { NUM_RUNS } from "./helpers";

import type { Route } from "@real-router/core";

/**
 * A forward's param check reads each end's params by core's grammar (#2569).
 *
 * Each end declares its name as a path param (`/c/:name`) or as a query param,
 * plain (`/c?name`) or with a marker in it (`/c?:name`, the query param
 * `:name`). A forward is owed a refusal exactly when the target's path declares
 * a path param the source's path does not. That holds for a target in the
 * table, read through `getUrlParams`, and for one in the batch, read from its
 * path — so the property asks both.
 *
 * ⚑ The oracle leans on the pool: every drawn name is one core reads as a single
 * param of exactly that name, as a path param and as a query param. The anchor
 * at the bottom holds the pool to it, and counts each kind of name a word
 * pattern reads wrongly.
 */

const ACCEPTED = "accepted";

/**
 * Word characters, then the others the pool draws: digits, which a word pattern
 * cannot read first, and characters it cannot read at all.
 */
const WORD_UNITS = ["a", "b", "c", "x", "y", "z", "A", "B", "_"] as const;
const OTHER_UNITS = ["0", "1", "9", "-", "$", ".", "и", "д"] as const;

const nameArbitrary = fc.string({
  unit: fc.constantFrom(...WORD_UNITS, ...OTHER_UNITS),
  minLength: 1,
  maxLength: 5,
});

type Form = "path" | "query" | "markedQuery";

/** A path param three times in five, otherwise a query declaration. */
const formArbitrary: fc.Arbitrary<Form> = fc.oneof(
  { arbitrary: fc.constant("path" as const), weight: 3 },
  { arbitrary: fc.constant("query" as const), weight: 1 },
  { arbitrary: fc.constant("markedQuery" as const), weight: 1 },
);

interface End {
  readonly name: string;
  readonly form: Form;
}

/** A source end and a target end, naming the same param half of the time. */
const endsArbitrary = fc
  .tuple(
    nameArbitrary,
    formArbitrary,
    fc.boolean(),
    nameArbitrary,
    formArbitrary,
  )
  .map(([held, heldForm, same, other, neededForm]): readonly [End, End] => [
    { name: held, form: heldForm },
    { name: same ? held : other, form: neededForm },
  ]);

const DECLARE: Record<Form, (prefix: string, name: string) => string> = {
  path: (prefix, name) => `/${prefix}/:${name}`,
  query: (prefix, name) => `/${prefix}?${name}`,
  markedQuery: (prefix, name) => `/${prefix}?:${name}`,
};

const pathOf = (prefix: string, end: End): string =>
  DECLARE[end.form](prefix, end.name);

/** Whether bare core reads `/x/:${name}` as one param of exactly that name. */
function coreReadsOne(name: string): boolean {
  try {
    const params = getPluginApi(
      createRouter([{ name: "x", path: `/x/:${name}` }]),
    ).getUrlParams("x");

    return params.length === 1 && params[0] === name;
  } catch {
    return false;
  }
}

/** Whether core reads `/x?${declared}` as one query param of exactly that name. */
function coreReadsOneQuery(declared: string): boolean {
  const { urlParams, queryParams } = buildParamMeta(`/x?${declared}`);

  return (
    urlParams.length === 0 &&
    queryParams.length === 1 &&
    queryParams[0] === declared
  );
}

function verdict(run: () => void): string {
  try {
    run();

    return ACCEPTED;
  } catch (error) {
    return (error as Error).message;
  }
}

const addWithPlugin = (table: readonly Route[], batch: readonly Route[]) =>
  verdict(() => {
    const router = createRouter([...table]);

    router.usePlugin(validationPlugin());
    getRoutesApi(router).add([...batch]);
  });

const owed = (target: string, source: End, needed: End): string =>
  needed.form !== "path" ||
  (source.form === "path" && source.name === needed.name)
    ? ACCEPTED
    : `[router.addRoute] forwardTo target "${target}" requires params [${needed.name}] that are not available in source route "c"`;

describe("a forward's param check reads each end's params by core's grammar (#2569)", () => {
  test.prop([endsArbitrary], { numRuns: NUM_RUNS.thorough })(
    "a forward is refused exactly when the target's path declares a param the source's does not",
    ([source, needed]) => {
      expect({
        tableTarget: addWithPlugin(
          [{ name: "q", path: pathOf("q", needed) }],
          [{ name: "c", path: pathOf("c", source), forwardTo: "q" }],
        ),
        batchTarget: addWithPlugin(
          [],
          [
            { name: "c", path: pathOf("c", source), forwardTo: "d" },
            { name: "d", path: pathOf("d", needed) },
          ],
        ),
      }).toStrictEqual({
        tableTarget: owed("q", source, needed),
        batchTarget: owed("d", source, needed),
      });
    },
  );

  it("the pool draws names core reads as one param, of each kind a word pattern reads wrongly", () => {
    const SAMPLES = 500;
    const reached = {
      hyphen: 0,
      dollarOrDot: 0,
      nonAscii: 0,
      digitFirst: 0,
      query: 0,
      markedQuery: 0,
      equal: 0,
      different: 0,
    };
    const unread: string[] = [];

    // Both predicates can say no: a `/` starts a segment, a `&` a second name.
    expect(coreReadsOne("a/b")).toBe(false);
    expect(coreReadsOneQuery("a&b")).toBe(false);

    for (const [source, needed] of fc.sample(endsArbitrary, {
      numRuns: SAMPLES,
      seed: 2569,
    })) {
      const names = [source.name, needed.name];

      unread.push(
        ...names.filter(
          (name) =>
            !coreReadsOne(name) ||
            !coreReadsOneQuery(name) ||
            !coreReadsOneQuery(`:${name}`),
        ),
      );

      const met: Record<keyof typeof reached, boolean> = {
        hyphen: names.some((name) => name.includes("-")),
        dollarOrDot: names.some((name) => /[$.]/u.test(name)),
        nonAscii: names.some((name) => /[ид]/u.test(name)),
        digitFirst: names.some((name) => /^\d/u.test(name)),
        query: source.form === "query" || needed.form === "query",
        markedQuery:
          source.form === "markedQuery" || needed.form === "markedQuery",
        equal: source.name === needed.name,
        different: source.name !== needed.name,
      };

      for (const kind of Object.keys(reached) as (keyof typeof reached)[]) {
        if (met[kind]) {
          reached[kind]++;
        }
      }
    }

    expect(unread).toStrictEqual([]);

    for (const count of Object.values(reached)) {
      expect(count).toBeGreaterThanOrEqual(SAMPLES / 20);
    }
  });
});
