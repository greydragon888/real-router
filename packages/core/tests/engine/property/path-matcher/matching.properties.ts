import { fc, test } from "@fast-check/vitest";

import {
  arbEncoding,
  arbMatchSafeEncodableSplatValue,
  arbMatchSafeEncodableValue,
  arbSafeParamValue,
  arbSplatValue,
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

  // NB: "static route beats param route" (the `/users/new` → `users.new`
  // direction) is a single-value assertion, not a property — it lives as a unit
  // (tests/unit/SegmentMatcher.test.ts, "static 'new' should win over param").
  // The genuine property is the inverse below: ANY non-static value falls
  // through to the param route.
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

        expect(resultLower!.segments.at(-1)!.fullName).toBe("users.profile");
        expect(resultUpper!.segments.at(-1)!.fullName).toBe("users.profile");

        // Param values are captured case-sensitively (only the STATIC segment
        // folds); assert the capture so a broken param branch can't hide behind
        // the route-name check.
        expect(resultLower!.params).toStrictEqual({ id: id.toLowerCase() });
        expect(resultUpper!.params).toStrictEqual({ id: id.toUpperCase() });
      },
    );
  });

  describe("format — buildPath always returns a string starting with /", () => {
    const paramMatcher = createParamMatcher();
    const splatMatcher = createSplatMatcher();

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
    const paramMatcher = createParamMatcher();
    // A splat route is the discriminating case: a splat captures the remainder,
    // so without the `//` guard `/files/a//b` would wrongly capture `a//b`
    // instead of being rejected. The param-route case alone passes via the
    // trie's natural rejection of the empty segment, so it does not exercise
    // the guard — the splat case does.
    const splatMatcher = createSplatMatcher();

    test.prop([arbSafeParamValue, arbSafeParamValue], {
      numRuns: NUM_RUNS.standard,
    })(
      "path containing // between segments is rejected (param route)",
      (seg1: string, seg2: string) => {
        expect(paramMatcher.match(`/${seg1}//${seg2}`)).toBeUndefined();
      },
    );

    test.prop([arbSafeParamValue, arbSafeParamValue], {
      numRuns: NUM_RUNS.standard,
    })(
      "path containing // is rejected even for a splat route (not captured)",
      (seg1: string, seg2: string) => {
        expect(splatMatcher.match(`/files/${seg1}//${seg2}`)).toBeUndefined();
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

    // #842: the property above only builds a QUERY-LESS path (`/users/<id>`),
    // so a fragment AFTER a query string was never generated — the bug (the
    // fragment folded into the query value, `?ref=v#frag` → `ref="v#frag"`)
    // survived the whole suite. This builds `path?ref=<v>` then appends
    // `#<fragment>`: the fragment must be stripped before query parsing, so the
    // result must equal the no-fragment match and recover `ref` intact.
    test.prop([arbSafeParamValue, arbSafeParamValue, arbSafeParamValue], {
      numRuns: NUM_RUNS.standard,
    })(
      "match(path + '?query#fragment') produces same result as match(path + '?query')",
      (id: string, refValue: string, fragment: string) => {
        const base = `${matcher.buildPath("users.profile", { id })}?ref=${refValue}`;

        const resultPlain = matcher.match(base);
        const resultWithHash = matcher.match(`${base}#${fragment}`);

        expect(resultPlain).toBeDefined();
        expect(resultWithHash).toBeDefined();

        expect(resultWithHash!.segments.map((s) => s.fullName)).toStrictEqual(
          resultPlain!.segments.map((s) => s.fullName),
        );
        // `id` is the path param (from `/:id`); `ref` is an undeclared query
        // param (from `?ref=…`), so after RFC-4 M2 (#1548) it rides the `search`
        // channel, not `params`. The result must match the no-fragment match on
        // BOTH channels, and `ref` must recover intact in `search` — proving the
        // fragment was stripped before query parsing (not folded into `ref`).
        expect(resultWithHash!.params).toStrictEqual(resultPlain!.params);
        expect(resultWithHash!.search).toStrictEqual(resultPlain!.search);
        expect(resultWithHash!.params).toStrictEqual({ id });
        expect(resultWithHash!.search).toStrictEqual({ ref: refValue });
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

  describe("roundtrip — build→match across all 4 encodings, with anti-identity", () => {
    // A space-bearing value round-trips through build→match under every strategy
    // (`none` keeps the space raw and the matcher accepts it; the rest encode it
    // to %20), so params must survive in all four; AND a non-identity strategy
    // must actually encode it in the URL. The anti-identity arm catches an
    // under-encoding stub that the roundtrip alone (permissive decode) misses —
    // exercised through the real matcher, not just the pure encoder.
    test.prop([arbEncoding, arbMatchSafeEncodableValue], {
      numRuns: NUM_RUNS.standard,
    })(
      "build→match preserves an encode-requiring param, and non-none encodes it in the URL",
      (enc, id: string) => {
        const matcher = createParamMatcher({ urlParamsEncoding: enc });
        const path = matcher.buildPath("users.profile", { id });
        const result = matcher.match(path);

        expect(result).toBeDefined();
        expect(result!.segments.at(-1)!.fullName).toBe("users.profile");
        expect(result!.params).toStrictEqual({ id });

        // anti-identity: space is raw under `none`, percent-encoded otherwise.
        if (enc === "none") {
          expect(path).toContain(" ");
        } else {
          expect(path).not.toContain(" ");
          expect(path).toContain("%");
        }
      },
    );
  });

  describe("roundtrip — splat build→match across all 4 encodings, with anti-identity", () => {
    test.prop([arbEncoding, arbMatchSafeEncodableSplatValue], {
      numRuns: NUM_RUNS.standard,
    })(
      "build→match preserves an encode-requiring splat, and non-none encodes its segments",
      (enc, path: string) => {
        const matcher = createSplatMatcher({ urlParamsEncoding: enc });
        const builtPath = matcher.buildPath("files", { path });
        const result = matcher.match(builtPath);

        expect(result).toBeDefined();
        expect(result!.params).toStrictEqual({ path });

        // anti-identity: splat encodes PER SEGMENT — each segment's space is raw
        // under `none`, %20 otherwise (the "/" separators stay raw under all
        // strategies). The fixpoint splat roundtrip above can't see an
        // under-encoding stub on the splat path; this can.
        if (enc === "none") {
          expect(builtPath).toContain(" ");
        } else {
          expect(builtPath).not.toContain(" ");
          expect(builtPath).toContain("%");
        }
      },
    );
  });

  // Audit 1.5: documents the actual per-strategy contract for a `/` inside a
  // NON-splat param value (the previous generator excluded `/`, so this was
  // untested). `default`/`uriComponent` percent-encode `/` → roundtrip holds;
  // `uri` (encodeURI) and `none` (identity) leave `/` raw → it becomes an extra
  // path segment and the single-param route no longer matches. For multi-segment
  // values use a splat (`*path`), which encodes per segment.
  describe("roundtrip — non-splat value containing '/' is strategy-dependent (1.5)", () => {
    const arbValueWithSlash = fc
      .array(fc.stringMatching(/^[a-zA-Z0-9]{1,6}$/), {
        minLength: 2,
        maxLength: 4,
      })
      .map((segments) => segments.join("/"));

    test.prop([arbValueWithSlash], { numRuns: NUM_RUNS.standard })(
      "default & uriComponent encode '/' and roundtrip",
      (value) => {
        for (const enc of ["default", "uriComponent"] as const) {
          const matcher = createParamMatcher({ urlParamsEncoding: enc });
          const path = matcher.buildPath("users.profile", { id: value });

          expect(matcher.match(path)?.params).toStrictEqual({ id: value });
        }
      },
    );

    test.prop([arbValueWithSlash], { numRuns: NUM_RUNS.standard })(
      "uri & none leave '/' raw → extra segment → no match (documented limit)",
      (value) => {
        for (const enc of ["uri", "none"] as const) {
          const matcher = createParamMatcher({ urlParamsEncoding: enc });
          const path = matcher.buildPath("users.profile", { id: value });

          // The raw '/' splits the value across segments the 1-param route
          // cannot absorb — use a splat param for multi-segment values.
          expect(matcher.match(path)).toBeUndefined();
        }
      },
    );
  });
});
