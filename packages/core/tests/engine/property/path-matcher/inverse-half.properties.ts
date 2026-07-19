import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbEncoding,
  arbMatchSafeEncodableSplatValue,
  arbMatchSafeEncodableValue,
  arbSafeParamValue,
  createInputNode,
  createRootWithChildren,
  NUM_RUNS,
} from "./helpers";
import { createTestMatcher } from "../../helpers/createTestMatcher";

/**
 * Inverse-pair contract for the PATH grammar: `range(buildPath) ⊆ dom(match)` —
 * every URL `buildPath` emits for a route must be one that route's own `match`
 * accepts. The path-grammar mirror of the search-params inverse-pair (#1155).
 *
 * Generator stresses the 3-token grammar (`static | :param | *splat`, M1) along
 * every axis at once: arbitrary depth (0–5 units), params over encode-requiring
 * values, an optional terminal splat over multi-segment values, and all four URL
 * encodings — including space-bearing values that every non-identity encoder
 * percent-encodes yet still round-trip through `match`.
 */

// A param value that stays a build↔match fixpoint (safe) OR one that every
// non-identity encoder transforms (a space) yet still survives `match` raw under
// `none` — real encoding teeth without leaving the round-trippable set.
const arbValue = fc.oneof(arbSafeParamValue, arbMatchSafeEncodableValue);

interface Unit {
  path: string;
  name?: string;
  value?: string;
}

// A static or a required param unit (the 3-token building blocks that precede a
// terminal splat).
function arbUnit(i: number): fc.Arbitrary<Unit> {
  const p = `p${i}`;

  return fc.oneof(
    fc.constant({ path: `/s${i}` }),
    arbValue.map((value) => ({ path: `/:${p}`, name: p, value })),
  );
}

function fold(units: Unit[], splat?: string) {
  let path = "";
  const params: Record<string, string> = {};

  for (const u of units) {
    path += u.path;

    if (u.name !== undefined) {
      params[u.name] = u.value!;
    }
  }

  if (splat !== undefined) {
    path += "/*rest";
    params.rest = splat;
  }

  return { path, params };
}

function tupleOf(arbs: fc.Arbitrary<Unit>[]): fc.Arbitrary<Unit[]> {
  return arbs.length === 0 ? fc.constant<Unit[]>([]) : fc.tuple(...arbs);
}

// 0–5 static/param units + an optional terminal splat over a brutal
// multi-segment value.
const arbRoute = fc
  .tuple(
    fc.array(fc.nat({ max: 4 }), { minLength: 0, maxLength: 5 }),
    fc.option(arbMatchSafeEncodableSplatValue, { nil: undefined }),
  )
  // Guarantee at least one segment so the route is never the bare "" root.
  // Filter on the TUPLE, BEFORE the chain: fast-check regenerates `counts`/`splat`
  // to satisfy it. Filtering the inner `tupleOf(counts.map(...))` instead would,
  // for `counts === []`, be `fc.constant([]).filter(() => false)` — an
  // unsatisfiable constant fast-check retries forever (a 100%-CPU hang).
  .filter(([counts, splat]) => counts.length > 0 || splat !== undefined)
  .chain(([counts, splat]) =>
    tupleOf(counts.map((_, i) => arbUnit(i))).map((units) =>
      fold(units, splat),
    ),
  );

describe("path inverse-pair (3-token grammar)", () => {
  // TOTALITY — `range(buildPath) ⊆ dom(match)`, under arbitrary depth × params ×
  // splats × values × encoding.
  test.prop([arbRoute, arbEncoding], { numRuns: NUM_RUNS.thorough })(
    "every built URL is one its own match accepts, under every encoding",
    ({ path, params }, encoding) => {
      const matcher = createTestMatcher({ urlParamsEncoding: encoding });

      matcher.registerTree(
        createRootWithChildren([
          createInputNode({ name: "r", path, fullName: "r" }),
        ]),
      );

      const built = matcher.buildPath("r", params);

      expect(
        matcher.match(built),
        `[${encoding}] buildPath("${path}", ${JSON.stringify(params)}) → "${built}" did not match`,
      ).toBeDefined();
    },
  );
});
