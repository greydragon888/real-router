import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbEncoding,
  arbMatchSafeEncodableSplatValue,
  arbMatchSafeEncodableValue,
  arbNumericParam,
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
 * BRUTAL generator — stresses the fixed class along every axis at once: arbitrary
 * depth (1–5 units), multiple optionals (leading / mid / trailing, present or
 * omitted), constraints on optionals, splats over multi-segment values, and all
 * four URL encodings — including space-bearing values that every non-identity
 * encoder percent-encodes yet still round-trip through `match`. #1147 (leading
 * optional omit → "//"), #1148 (constraint on an omitted optional →
 * `test(undefined)`) and #1149 (optional splat) each violated exactly this.
 *
 * Two shapes are deliberately OUT of range (a 20k-run free-grammar sweep proved
 * these are the *only* remaining inverse-half members — separate, orthogonal
 * semantics, not this class): an optional param ADJACENT to another param
 * (positional reuse, #736) and an optional param before a splat. So optionals are
 * always bracketed by a static or the route end, and splats never co-occur with
 * an optional.
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

// A unit whose optional (if any) is always followed by a static within the unit,
// so an optional is NEVER adjacent to another param (positional reuse is #736).
function arbUnit(i: number): fc.Arbitrary<Unit> {
  const p = `p${i}`;

  return fc.oneof(
    fc.constant({ path: `/s${i}` }),
    arbValue.map((value) => ({ path: `/:${p}`, name: p, value })),
    arbNumericParam.map((value) => ({
      path: String.raw`/:${p}<\d+>`,
      name: p,
      value,
    })),
    fc
      .tuple(fc.boolean(), arbValue)
      .map(([present, value]) =>
        present
          ? { path: `/:${p}?/t${i}`, name: p, value }
          : { path: `/:${p}?/t${i}` },
      ),
    fc
      .tuple(fc.boolean(), arbNumericParam)
      .map(([present, value]) =>
        present
          ? { path: String.raw`/:${p}<\d+>?/t${i}`, name: p, value }
          : { path: String.raw`/:${p}<\d+>?/t${i}` },
      ),
  );
}

// A required-only unit (no optionals) — for splat routes.
function arbRequiredUnit(i: number): fc.Arbitrary<Unit> {
  const p = `p${i}`;

  return fc.oneof(
    fc.constant({ path: `/s${i}` }),
    arbValue.map((value) => ({ path: `/:${p}`, name: p, value })),
    arbNumericParam.map((value) => ({
      path: String.raw`/:${p}<\d+>`,
      name: p,
      value,
    })),
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

// Mode A: 1–5 optional-bearing units + an optional terminal bare optional (which
// may carry a stray empty-query `?` — the #1324 F2 `/:a??` class), NO splat.
const arbOptionalRoute = fc
  .tuple(
    fc.array(fc.nat({ max: 4 }), { minLength: 1, maxLength: 5 }),
    fc.option(
      fc.record({
        constrained: fc.boolean(),
        present: fc.boolean(),
        emptyQuery: fc.boolean(),
        strValue: arbValue,
        numValue: arbNumericParam,
      }),
      { nil: undefined },
    ),
  )
  .chain(([counts, trailing]) =>
    tupleOf(counts.map((_, i) => arbUnit(i))).map((units) => {
      const extra: Unit[] = [];

      if (trailing) {
        // A stray trailing `?` after the terminal optional marker is an EMPTY query
        // declaration (`/:pT??`, `/:pT<\d+>??`) — the #1324 F2 degenerate the L2
        // `compileBuildParts` reconstruction drops (`buildPath` emits `/v0`, not the
        // pre-migration `/v0?`), so it must still fall in `dom(match)`. Only valid at
        // the route END (mid-path it would be a real query separator, not a segment).
        const marker =
          (trailing.constrained ? String.raw`/:pT<\d+>?` : "/:pT?") +
          (trailing.emptyQuery ? "?" : "");
        const value = trailing.constrained
          ? trailing.numValue
          : trailing.strValue;

        extra.push(
          trailing.present
            ? { path: marker, name: "pT", value }
            : { path: marker },
        );
      }

      return fold([...units, ...extra]);
    }),
  );

// Mode B: 0–3 required units + a terminal splat over a brutal multi-segment value.
const arbSplatRoute = fc
  .tuple(
    fc.array(fc.nat({ max: 2 }), { minLength: 0, maxLength: 3 }),
    arbMatchSafeEncodableSplatValue,
  )
  .chain(([counts, splat]) =>
    tupleOf(counts.map((_, i) => arbRequiredUnit(i))).map((units) =>
      fold(units, splat),
    ),
  );

const arbRoute = fc.oneof(arbOptionalRoute, arbSplatRoute);

describe("path inverse-pair — BRUTAL (#1147/#1148/#1149 class)", () => {
  // TOTALITY — `range(buildPath) ⊆ dom(match)`, the exact contract the three bugs
  // violated, now under arbitrary depth × optionals × constraints × values × encoding.
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
