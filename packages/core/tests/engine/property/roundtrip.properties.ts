// packages/route-tree/tests/property/roundtrip.properties.ts

import { fc, test } from "@fast-check/vitest";

import {
  arbArrayFormat,
  arbArrayItems,
  arbAnyParamValue,
  arbAnyQueryValue,
  arbSplatValue,
  createArrayMatcher,
  createMixedMatcher,
  createParamMatcher,
  createQueryMatcher,
  createSplatAncestorMatcher,
  createSplatMatcher,
  NUM_RUNS,
} from "./helpers";
import { createRouteTree } from "../../../src/engine/builder/createRouteTree";
import { createMatcher } from "../../../src/engine/createMatcher";
import {
  ENCODING_METHODS,
  encodeParam,
} from "../../../src/engine/path-matcher/encoding";

describe("Roundtrip Properties", () => {
  describe("buildPath→match", () => {
    const matcher = createParamMatcher();

    test.prop([arbAnyParamValue], { numRuns: NUM_RUNS.thorough })(
      "matched route name equals the name used to build the path",
      (id: string) => {
        const path = matcher.buildPath("users.profile", { id });
        const result = matcher.match(path);

        expect(result).toBeDefined();
        expect(result!.segments.at(-1)!.fullName).toBe("users.profile");
        expect(result!.params).toStrictEqual({ id });
      },
    );
  });

  describe("splat buildPath→match", () => {
    const matcher = createSplatMatcher();

    test.prop([arbSplatValue], { numRuns: NUM_RUNS.thorough })(
      "splat param is preserved through buildPath→match roundtrip",
      (splatPath: string) => {
        const path = matcher.buildPath("files.catchAll", { path: splatPath });
        const result = matcher.match(path);

        expect(result).toBeDefined();
        expect(result!.segments.at(-1)!.fullName).toBe("files.catchAll");
        expect(result!.params).toStrictEqual({ path: splatPath });
      },
    );
  });

  describe("splat ANCESTOR, param descendant (#1975)", () => {
    // Domain extension, not a second property: the arm above covers a FINAL
    // splat, where the slot and the name agree on being a splat. Here the
    // ancestor's `*path` is non-final, so #1568 drops it and the child's
    // `:path` is the only slot — it must take the PARAM encoder, whatever the
    // ancestor called itself.
    const matcher = createSplatAncestorMatcher();

    test.prop([arbSplatValue], { numRuns: NUM_RUNS.thorough })(
      "a value with separators round-trips to the DESCENDANT, not the ancestor",
      (value: string) => {
        // ⚑ The PREMISE, asserted rather than assumed: the ancestor really is a
        // splat, so its own slot keeps the separators. Without this the fixture
        // could silently degrade into a plain-`:param` tree (a tokenizer change
        // making `*path` static), and the round-trip below would still pass —
        // as a duplicate of the arm above rather than as this arm.
        // Both sides assert WHICH encoder the slot took, against the encoders
        // themselves — never a hand-rolled copy, which would drift from them
        // exactly the way the two splat-ness spellings drifted (#1975).
        expect(matcher.buildPath("files", { path: value })).toBe(
          `/files/${encodeParam(value, "default")}`,
        );

        const path = matcher.buildPath("files.edit", { path: value });

        // ⚑ The SUBJECT is the encoder, and the URL is where it is observable.
        // Asserting only `match(path)` borrows the discrimination from the
        // trie's resolution order: `#decodeParams` turns `%2F` back into `/`,
        // so a round-trip alone is INVARIANT to which encoder ran.
        expect(path).toBe(`/files/${ENCODING_METHODS.default(value)}/edit`);

        const result = matcher.match(path);

        expect(result).toBeDefined();
        expect(result!.segments.at(-1)!.fullName).toBe("files.edit");
        expect(result!.params).toStrictEqual({ path: value });
      },
    );
  });

  describe("query-only", () => {
    // Pin none strategies so arbitrary string values round-trip verbatim — this
    // test checks structural URL roundtrip, not type coercion (default is now
    // auto, which would coerce "0"→0 / "true"→true; that's covered in search-params). (#744)
    const matcher = createQueryMatcher({
      numberFormat: "none",
      booleanFormat: "none",
    });

    test.prop([arbAnyQueryValue, arbAnyQueryValue], {
      numRuns: NUM_RUNS.thorough,
    })(
      "query params decoded after match equal original values",
      (q: string, page: string) => {
        const path = matcher.buildPath("search", { q, page });
        const result = matcher.match(path);

        expect(result).toBeDefined();
        expect(result!.search.q).toBe(q);
        expect(result!.search.page).toBe(page);
      },
    );
  });

  describe("array query params produce format-consistent output for all 4 formats", () => {
    test.prop([arbArrayFormat, arbArrayItems], { numRuns: NUM_RUNS.standard })(
      "buildPath→match produces format-expected output for each array format",
      (format: "none" | "brackets" | "index" | "comma", items: string[]) => {
        const matcher = createArrayMatcher(format);
        const path = matcher.buildPath("items", { tags: items });
        const result = matcher.match(path);

        expect(result).toBeDefined();

        const decoded = result!.search.tags as string | string[];

        if (
          format === "brackets" ||
          format === "index" ||
          (format === "none" && items.length > 1) ||
          (format === "comma" && items.length > 1)
        ) {
          expect(Array.isArray(decoded)).toBe(true);
          expect(decoded).toStrictEqual(items);
        } else {
          // "none" single-item: scalar (no repeated key to trigger array)
          expect(decoded).toBe(items[0]);
        }
      },
    );
  });

  describe("Nested roundtrip: 3+ level deep routes preserve name and params", () => {
    const deepMatcher = (() => {
      const tree = createRouteTree("", "", [
        {
          name: "org",
          path: "/org/:orgId",
          children: [
            {
              name: "team",
              path: "/team/:teamId",
              children: [
                {
                  name: "member",
                  path: "/member/:memberId",
                },
              ],
            },
          ],
        },
      ]);
      const m = createMatcher();

      m.registerTree(tree);

      return m;
    })();

    test.prop([arbAnyParamValue, arbAnyParamValue, arbAnyParamValue], {
      numRuns: NUM_RUNS.standard,
    })(
      "3-level nested route roundtrips name and all params",
      (orgId: string, teamId: string, memberId: string) => {
        const path = deepMatcher.buildPath("org.team.member", {
          orgId,
          teamId,
          memberId,
        });
        const result = deepMatcher.match(path);

        expect(result).toBeDefined();
        expect(result!.segments.at(-1)!.fullName).toBe("org.team.member");
        expect(result!.params).toStrictEqual({ orgId, teamId, memberId });
      },
    );
  });

  describe("URL params and query params are isolated in match result", () => {
    // none strategies keep the arbitrary query value an opaque string (default
    // auto would coerce numeric/boolean-looking values). (#744)
    const matcher = createMixedMatcher({
      numberFormat: "none",
      booleanFormat: "none",
    });

    test.prop([arbAnyParamValue, arbAnyQueryValue], {
      numRuns: NUM_RUNS.standard,
    })(
      "URL param is typed url, query param is typed query in result meta",
      (category: string, q: string) => {
        const path = matcher.buildPath("results", { category, q });
        const result = matcher.match(path);

        expect(result).toBeDefined();

        const paramsMeta = result!.meta.results;

        expect(paramsMeta).toBeDefined();
        expect(paramsMeta.category).toBe("url");
        expect(paramsMeta.q).toBe("query");
        expect(result!.params.category).toBe(category);
        expect(result!.search.q).toBe(q);
      },
    );
  });

  describe("splat with a more-specific child (INVARIANTS Matching #24)", () => {
    // A splat node's children match at the splat's OWN position, so the splat
    // captures nothing for them. buildPath used to emit a value there anyway,
    // printing a URL that fell back to the wildcard or matched nothing (#1568).
    // The guard is a NAME roundtrip, not "matches something": the broken build
    // did match — it just resolved to the parent.
    const arbSegments = fc.array(
      fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/).filter((s) => s !== "index"),
      { minLength: 1, maxLength: 3 },
    );

    // ⚠ The two generators are independent, so they CAN draw the same string —
    // and then the fixture is genuinely ambiguous rather than broken: with
    // `tail = ["t"]` and `fallback = "t"`, `buildPath("root.all", {rest:"t"})`
    // emits `/root/t`, which the more-specific child `leaf` (`/t`) matches by
    // design. The property then fails on correct behaviour. Filter the PAIR (not
    // either generator alone — a filter over a single arbitrary here has nothing
    // to reject against) so the drawn splat value never spells the child's own
    // path. Verified: `[["t"],"t"]` reproduces identically on `f5d3125b7`, i.e.
    // the flake predates the pipeline work and was only ever seed-dependent.
    const arbDistinctPair = fc
      .tuple(arbSegments, arbSplatValue)
      .filter(([tail, fallback]) => fallback !== tail.join("/"));

    test.prop([arbDistinctPair], { numRuns: NUM_RUNS.standard })(
      "a route reached through a splat builds a URL that matches that same route",
      ([tail, fallback]: [string[], string]) => {
        const matcher = createMatcher();

        matcher.registerTree(
          createRouteTree("", "", [
            {
              name: "root",
              path: "/root",
              children: [
                {
                  name: "all",
                  path: "/*rest",
                  children: [{ name: "leaf", path: `/${tail.join("/")}` }],
                },
              ],
            },
          ]),
        );

        const childPath = matcher.buildPath("root.all.leaf", {});

        expect(matcher.match(childPath)?.segments.at(-1)?.fullName).toBe(
          "root.all.leaf",
        );

        // The splat still binds where it IS terminal — the collapse must not
        // swallow the fallback route's own capture.
        const splatPath = matcher.buildPath("root.all", { rest: fallback });
        const splatResult = matcher.match(splatPath);

        expect(splatResult?.segments.at(-1)?.fullName).toBe("root.all");
        expect(splatResult?.params.rest).toBe(fallback);
      },
    );
  });
});
