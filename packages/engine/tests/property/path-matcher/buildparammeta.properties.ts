import { fc, test } from "@fast-check/vitest";

import { NUM_RUNS } from "./helpers";
import { buildParamMeta } from "../../../src/path-matcher/buildParamMeta";

/**
 * Structural invariants for `buildParamMeta` — a pure path-pattern parser.
 *
 * These tests are **model-based**: a random structural model (an ordered list of
 * typed segments + optional splat + query keys) is rendered to a path string,
 * and `buildParamMeta`'s output is checked against the model derived
 * independently of the parser. The model — not the parser's current behaviour —
 * is the oracle. If `buildParamMeta` mis-classifies, drops, reorders, or leaks a
 * parameter, the model disagrees and the test fails.
 *
 * Invariants asserted:
 * - **Exact classification:** `urlParams` / `queryParams` / `spatParams` /
 *   `paramTypeMap` / `constraintPatterns` / `pathPattern` all equal the model.
 * - **Splat ⊆ url:** every splat name is also a url param.
 * - **Disjoint type map:** no name is both url and query.
 * - **`pathPattern` is the query-free residue:** re-parsing it yields the same
 *   url params and an empty `queryParams`.
 * - **Purity / determinism:** two calls on the same input agree.
 */

type SegKind =
  "static" | "param" | "constrained" | "constrainedLazy" | "optional";

interface Spec {
  kinds: SegKind[];
  splat: boolean;
  queryCount: number;
  pool: string[];
}

// Includes a hyphen so the model exercises the #738 name class (`:my-param`)
// that PARAM_NAME_PATTERN (`[^/?<]+`) admits — not just `\w`. The leading char
// stays `[a-z]` so a name never starts with `-`.
const arbName = fc.stringMatching(/^[a-z][a-z0-9-]{0,5}$/);

const arbSpec = fc.record({
  kinds: fc.array(
    fc.constantFrom<SegKind>(
      "static",
      "param",
      "constrained",
      "constrainedLazy",
      "optional",
    ),
    { maxLength: 5 },
  ),
  splat: fc.boolean(),
  queryCount: fc.nat({ max: 3 }),
  // Unique pool so every segment / splat / query name is distinct — the
  // precondition under which classification is unambiguous.
  pool: fc.uniqueArray(arbName, { minLength: 16, maxLength: 16 }),
});

interface Model {
  path: string;
  pathPattern: string;
  urlParams: string[];
  queryParams: string[];
  spatParams: string[];
  paramTypeMap: Record<string, "url" | "query">;
  constrainedNames: string[];
}

function renderSegment(kind: SegKind, name: string): string {
  switch (kind) {
    case "static": {
      return name;
    }
    case "param": {
      return `:${name}`;
    }
    case "constrained": {
      return String.raw`:${name}<\d+>`;
    }
    case "constrainedLazy": {
      // `?` inside the constraint — must NOT be read as a query separator (#738).
      return String.raw`:${name}<\d?>`;
    }
    case "optional": {
      return `:${name}?`;
    }
  }
}

function buildModel(spec: Spec): Model {
  const { kinds, splat, queryCount, pool } = spec;
  let next = 0;

  const pieces: string[] = [];
  const urlParams: string[] = [];
  const spatParams: string[] = [];
  const constrainedNames: string[] = [];
  const paramTypeMap: Record<string, "url" | "query"> = {};

  for (const kind of kinds) {
    const name = pool[next++];

    pieces.push(renderSegment(kind, name));

    if (kind !== "static") {
      urlParams.push(name);
      paramTypeMap[name] = "url";
    }

    if (kind === "constrained" || kind === "constrainedLazy") {
      constrainedNames.push(name);
    }
  }

  if (splat) {
    const name = pool[next++];

    pieces.push(`*${name}`);
    urlParams.push(name);
    spatParams.push(name);
    paramTypeMap[name] = "url";
  }

  const pathPattern = `/${pieces.join("/")}`;

  const queryKeys = pool.slice(next, next + queryCount);

  for (const key of queryKeys) {
    paramTypeMap[key] = "query";
  }

  const path =
    queryKeys.length > 0
      ? `${pathPattern}?${queryKeys.join("&")}`
      : pathPattern;

  return {
    path,
    pathPattern,
    urlParams,
    queryParams: queryKeys,
    spatParams,
    paramTypeMap,
    constrainedNames,
  };
}

describe("buildParamMeta structural invariants", () => {
  test.prop([arbSpec], { numRuns: NUM_RUNS.thorough })(
    "output matches the independently-derived structural model",
    (spec) => {
      const model = buildModel(spec);
      const meta = buildParamMeta(model.path);

      // Exact classification — order included (regex/split run left-to-right).
      expect(meta.urlParams).toStrictEqual(model.urlParams);
      expect(meta.queryParams).toStrictEqual(model.queryParams);
      expect(meta.spatParams).toStrictEqual(model.spatParams);
      expect(meta.paramTypeMap).toStrictEqual(model.paramTypeMap);
      expect(meta.pathPattern).toBe(model.pathPattern);

      // Constraint entries: exactly the constrained names.
      const byLocale = (a: string, b: string): number => a.localeCompare(b);

      expect(
        [...meta.constraintPatterns.keys()].toSorted(byLocale),
      ).toStrictEqual(model.constrainedNames.toSorted(byLocale));
    },
  );

  test.prop([arbSpec], { numRuns: NUM_RUNS.standard })(
    "splat names are a subset of url params; type map has no url/query overlap",
    (spec) => {
      const meta = buildParamMeta(buildModel(spec).path);

      for (const s of meta.spatParams) {
        expect(meta.urlParams).toContain(s);
      }

      const urlSet = new Set(meta.urlParams);

      for (const q of meta.queryParams) {
        expect(urlSet.has(q)).toBe(false);
      }
    },
  );

  test.prop([arbSpec], { numRuns: NUM_RUNS.standard })(
    "pathPattern is the query-free residue (re-parsing yields same url params, no query)",
    (spec) => {
      const meta = buildParamMeta(buildModel(spec).path);
      const reparsed = buildParamMeta(meta.pathPattern);

      expect(reparsed.urlParams).toStrictEqual(meta.urlParams);
      expect(reparsed.queryParams).toStrictEqual([]);
      expect(reparsed.pathPattern).toBe(meta.pathPattern);
    },
  );

  test.prop([arbSpec], { numRuns: NUM_RUNS.standard })(
    "is deterministic / pure — two calls agree",
    (spec) => {
      const { path } = buildModel(spec);
      const a = buildParamMeta(path);
      const b = buildParamMeta(path);

      expect(a.urlParams).toStrictEqual(b.urlParams);
      expect(a.queryParams).toStrictEqual(b.queryParams);
      expect(a.spatParams).toStrictEqual(b.spatParams);
      expect(a.paramTypeMap).toStrictEqual(b.paramTypeMap);
      expect(a.pathPattern).toBe(b.pathPattern);
    },
  );
});
