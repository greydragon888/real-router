import { fc, test } from "@fast-check/vitest";

import {
  arbEncoding,
  arbNonNumericParam,
  arbNumericParam,
  arbSafeParamValue,
  arbSplatValue,
  createConstrainedMatcher,
  createOptionalParamMatcher,
  createParamMatcher,
  createParamSplatMatcher,
  createSplatMatcher,
  createStaticParamPriorityMatcher,
  NUM_RUNS,
} from "./helpers";

describe("Matching Properties", () => {
  describe("roundtrip — match(buildPath(name, params)).name === name", () => {
    const matcher = createParamMatcher();

    test.prop([arbSafeParamValue], { numRuns: NUM_RUNS.thorough })(
      "matched route name equals the name used to build the path",
      (id: string) => {
        const path = matcher.buildPath("users.profile", { id });
        const result = matcher.match(path);

        expect(result).toBeDefined();
        expect(result!.segments.at(-1)!.fullName).toBe("users.profile");
      },
    );
  });

  describe("roundtrip — params preserved through build→match", () => {
    const matcher = createParamMatcher();

    test.prop([arbSafeParamValue], { numRuns: NUM_RUNS.thorough })(
      "decoded params after match equal the original param values",
      (id: string) => {
        const path = matcher.buildPath("users.profile", { id });
        const result = matcher.match(path);

        expect(result).toBeDefined();
        expect(result!.params).toStrictEqual({ id });
      },
    );
  });

  describe("roundtrip — optional param: both with and without produce same route", () => {
    const matcher = createOptionalParamMatcher();

    test.prop([arbSafeParamValue], { numRuns: NUM_RUNS.standard })(
      "route with optional param present matches the same route name",
      (query: string) => {
        const pathWith = matcher.buildPath("search", { query });
        const pathWithout = matcher.buildPath("search", {});

        const resultWith = matcher.match(pathWith);
        const resultWithout = matcher.match(pathWithout);

        expect(resultWith).toBeDefined();
        expect(resultWithout).toBeDefined();

        const nameWith = resultWith!.segments.at(-1)!.fullName;
        const nameWithout = resultWithout!.segments.at(-1)!.fullName;

        expect(nameWith).toBe("search");
        expect(nameWithout).toBe("search");
        expect(nameWith).toBe(nameWithout);
      },
    );
  });

  describe("roundtrip — splat params preserve path structure", () => {
    const matcher = createSplatMatcher();

    test.prop([arbSplatValue], { numRuns: NUM_RUNS.standard })(
      "splat param value is restored after build→match roundtrip",
      (path: string) => {
        const builtPath = matcher.buildPath("files", { path });
        const result = matcher.match(builtPath);

        expect(result).toBeDefined();
        expect(result!.params).toStrictEqual({ path });
      },
    );
  });

  describe("determinism — same path always yields same result", () => {
    const matcher = createParamMatcher();

    test.prop([arbSafeParamValue], { numRuns: NUM_RUNS.standard })(
      "calling match twice with the same path returns identical results",
      (id: string) => {
        const path = matcher.buildPath("users.profile", { id });

        const result1 = matcher.match(path);
        const result2 = matcher.match(path);

        expect(result1).toBeDefined();
        expect(result2).toBeDefined();
        expect(result1!.segments.map((s) => s.fullName)).toStrictEqual(
          result2!.segments.map((s) => s.fullName),
        );
        expect(result1!.params).toStrictEqual(result2!.params);
      },
    );
  });

  describe("priority — static route beats param route at same level", () => {
    const matcher = createStaticParamPriorityMatcher();

    test.prop([fc.constantFrom("new")], { numRuns: NUM_RUNS.fast })(
      "/users/new matches the static route, not the param route",
      (segment: string) => {
        const result = matcher.match(`/users/${segment}`);

        expect(result).toBeDefined();
        expect(result!.segments.at(-1)!.fullName).toBe("users.new");
        expect(result!.params).toStrictEqual({});
      },
    );
  });

  describe("param fallback for non-static values", () => {
    const matcher = createStaticParamPriorityMatcher();

    test.prop([arbSafeParamValue.filter((v) => v !== "new")], {
      numRuns: NUM_RUNS.standard,
    })("non-static segment values go to the param route", (id: string) => {
      const result = matcher.match(`/users/${id}`);

      expect(result).toBeDefined();
      expect(result!.segments.at(-1)!.fullName).toBe("users.profile");
      expect(result!.params).toStrictEqual({ id });
    });
  });

  describe("priority — param route beats splat route at same level", () => {
    const matcher = createParamSplatMatcher();

    test.prop([arbSafeParamValue], { numRuns: NUM_RUNS.standard })(
      "single-segment path matches param route, not splat route",
      (id: string) => {
        const result = matcher.match(`/items/${id}`);

        expect(result).toBeDefined();
        expect(result!.segments.at(-1)!.fullName).toBe("items.specific");
        expect(result!.params).toStrictEqual({ id });
      },
    );
  });

  describe("constraint satisfaction — matched params satisfy constraint regex", () => {
    const matcher = createConstrainedMatcher();

    test.prop([arbNumericParam], { numRuns: NUM_RUNS.standard })(
      "params from a matched constrained route satisfy the constraint pattern",
      (id: string) => {
        const path = matcher.buildPath("users.profile", { id });
        const result = matcher.match(path);

        expect(result).toBeDefined();

        const paramId = String(result!.params.id);

        expect(/^\d+$/.test(paramId)).toBe(true);
      },
    );
  });

  describe("constraint rejection — buildPath throws for violating params", () => {
    const matcher = createConstrainedMatcher();

    test.prop([arbNonNumericParam], { numRuns: NUM_RUNS.standard })(
      "buildPath throws when param value violates the constraint",
      (id: string) => {
        expect(() => {
          matcher.buildPath("users.profile", { id });
        }).toThrow();
      },
    );
  });

  describe("case insensitivity — match(path) same as match(path.toLowerCase())", () => {
    const matcher = createParamMatcher({ caseSensitive: false });

    test.prop([arbSafeParamValue], { numRuns: NUM_RUNS.standard })(
      "with caseSensitive=false, matching is independent of case for static segments",
      (id: string) => {
        const path = matcher.buildPath("users.profile", { id });

        const lowerPath = path.toLowerCase();
        const upperPath = path.toUpperCase();

        const resultLower = matcher.match(lowerPath);
        const resultUpper = matcher.match(upperPath);

        expect(resultLower).toBeDefined();
        expect(resultUpper).toBeDefined();

        const nameFromLower = resultLower!.segments.at(-1)!.fullName;
        const nameFromUpper = resultUpper!.segments.at(-1)!.fullName;

        expect(nameFromLower).toBe("users.profile");
        expect(nameFromUpper).toBe("users.profile");
      },
    );
  });

  describe("format — buildPath always returns a string starting with /", () => {
    const paramMatcher = createParamMatcher();
    const splatMatcher = createSplatMatcher();
    const optMatcher = createOptionalParamMatcher();

    test.prop([arbSafeParamValue], { numRuns: NUM_RUNS.standard })(
      "param route buildPath starts with /",
      (id: string) => {
        const path = paramMatcher.buildPath("users.profile", { id });

        expect(path.startsWith("/")).toBe(true);
      },
    );

    test.prop([arbSplatValue], { numRuns: NUM_RUNS.standard })(
      "splat route buildPath starts with /",
      (path: string) => {
        const builtPath = splatMatcher.buildPath("files", { path });

        expect(builtPath.startsWith("/")).toBe(true);
      },
    );

    test.prop([arbSafeParamValue], { numRuns: NUM_RUNS.standard })(
      "optional param route buildPath starts with /",
      (query: string) => {
        const builtWith = optMatcher.buildPath("search", { query });
        const builtWithout = optMatcher.buildPath("search", {});

        expect(builtWith.startsWith("/")).toBe(true);
        expect(builtWithout.startsWith("/")).toBe(true);
      },
    );
  });

  describe("trailing slash — trailingSlash:'always' adds trailing /", () => {
    const matcher = createParamMatcher();

    test.prop([arbSafeParamValue], { numRuns: NUM_RUNS.standard })(
      "buildPath with trailingSlash=always ends with /",
      (id: string) => {
        const path = matcher.buildPath(
          "users.profile",
          { id },
          { trailingSlash: "always" },
        );

        expect(path.endsWith("/")).toBe(true);
      },
    );
  });

  describe("rejection — match returns undefined for paths with raw Unicode", () => {
    const matcher = createParamMatcher();

    const arbUnicodeChar = fc
      .oneof(
        fc.integer({ min: 0x00_80, max: 0xd7_ff }),
        fc.integer({ min: 0xe0_00, max: 0xff_ff }),
      )
      .map((code) => String.fromCodePoint(code));

    test.prop([arbSafeParamValue, arbUnicodeChar], {
      numRuns: NUM_RUNS.standard,
    })(
      "path containing a raw Unicode char (U+0080–U+FFFF) is rejected",
      (prefix: string, ch: string) => {
        const path = `/users/${prefix}${ch}`;

        expect(matcher.match(path)).toBeUndefined();
      },
    );
  });

  describe("rejection — match returns undefined for paths with //", () => {
    const matcher = createParamMatcher();

    test.prop([arbSafeParamValue, arbSafeParamValue], {
      numRuns: NUM_RUNS.standard,
    })(
      "path containing // between segments is rejected",
      (seg1: string, seg2: string) => {
        const path = `/${seg1}//${seg2}`;

        expect(matcher.match(path)).toBeUndefined();
      },
    );
  });

  describe("hash stripping — match ignores fragment identifiers", () => {
    const matcher = createParamMatcher();

    test.prop([arbSafeParamValue, arbSafeParamValue], {
      numRuns: NUM_RUNS.standard,
    })(
      "match(path + '#fragment') produces same result as match(path)",
      (id: string, fragment: string) => {
        const path = matcher.buildPath("users.profile", { id });

        const resultPlain = matcher.match(path);
        const resultWithHash = matcher.match(`${path}#${fragment}`);

        expect(resultPlain).toBeDefined();
        expect(resultWithHash).toBeDefined();

        expect(resultWithHash!.segments.map((s) => s.fullName)).toStrictEqual(
          resultPlain!.segments.map((s) => s.fullName),
        );
        expect(resultWithHash!.params).toStrictEqual(resultPlain!.params);
      },
    );
  });

  describe("rejection — match returns undefined for malformed percent encoding", () => {
    const matcher = createParamMatcher();

    const arbNonHexChar = fc.constantFrom(
      "G",
      "H",
      "Z",
      "g",
      "h",
      "z",
    ) as fc.Arbitrary<string>;

    test.prop([arbNonHexChar, arbNonHexChar], { numRuns: NUM_RUNS.fast })(
      "param containing %XX with non-hex X is rejected",
      (h1: string, h2: string) => {
        const path = `/users/v%${h1}${h2}`;

        expect(matcher.match(path)).toBeUndefined();
      },
    );
  });

  describe("roundtrip — optional param values preserved through build→match", () => {
    const matcher = createOptionalParamMatcher();

    test.prop([arbSafeParamValue], { numRuns: NUM_RUNS.standard })(
      "optional param value survives build→match roundtrip",
      (query: string) => {
        const path = matcher.buildPath("search", { query });
        const result = matcher.match(path);

        expect(result).toBeDefined();
        expect(result!.params).toStrictEqual({ query });
      },
    );
  });

  describe("roundtrip — build→match works with all 4 encoding types", () => {
    test.prop([arbEncoding, arbSafeParamValue], {
      numRuns: NUM_RUNS.standard,
    })(
      "build→match roundtrip preserves params with any encoding",
      (enc, id: string) => {
        const matcher = createParamMatcher({ urlParamsEncoding: enc });
        const path = matcher.buildPath("users.profile", { id });
        const result = matcher.match(path);

        expect(result).toBeDefined();
        expect(result!.segments.at(-1)!.fullName).toBe("users.profile");
        expect(result!.params).toStrictEqual({ id });
      },
    );
  });
});
