import { fc, test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import {
  NUM_RUNS,
  makeMinimalState,
  arbBasePath,
  arbUrlPath,
  arbNonHttpProtocol,
  arbAsciiPath,
  arbEncodablePath,
  arbRawOnlyPath,
  arbSearchString,
  arbHashString,
  arbFullState,
  createSpyBrowser,
  createMockPluginApi,
  createMockPopStateEvent,
} from "./helpers";
import {
  normalizeBase,
  safelyEncodePath,
  pushState,
  replaceState,
} from "../../../src/browser-env";
import {
  updateBrowserState,
  getRouteFromEvent,
} from "../../../src/browser-env/popstate-utils";
import { safeParseUrl } from "../../../src/browser-env/url-parsing";
import {
  buildUrl,
  extractPath,
  urlToPath,
} from "../../../src/browser-env/url-utils";

import type { Params } from "@real-router/core";

describe("Browser-env Properties", () => {
  describe("normalizeBase — idempotency", () => {
    test.prop([arbBasePath], { numRuns: NUM_RUNS.thorough })(
      "normalizeBase(normalizeBase(b)) === normalizeBase(b)",
      (base: string) => {
        const once = normalizeBase(base);
        const twice = normalizeBase(once);

        expect(twice).toStrictEqual(once);
      },
    );
  });

  describe("normalizeBase — canonical form", () => {
    test.prop([arbBasePath], { numRuns: NUM_RUNS.thorough })(
      "result is empty or starts with '/' and has no trailing '/'",
      (base: string) => {
        const result = normalizeBase(base);

        if (result === "") {
          expect(result).toStrictEqual("");
        } else {
          expect(result.startsWith("/")).toBe(true);
          expect(result.endsWith("/")).toBe(false);
        }
      },
    );
  });

  describe("normalizeBase — non-empty segments preserved", () => {
    test.prop([arbBasePath], { numRuns: NUM_RUNS.thorough })(
      "non-empty segments between slashes are preserved",
      (base: string) => {
        const result = normalizeBase(base);
        const inputSegments = base.split("/").filter((s) => s.length > 0);
        const resultSegments = result.split("/").filter((s) => s.length > 0);

        expect(resultSegments).toStrictEqual(inputSegments);
      },
    );
  });

  describe("normalizeBase — empty string identity", () => {
    test("normalizeBase('') === ''", () => {
      expect(normalizeBase("")).toStrictEqual("");
    });
  });

  describe("normalizeBase — no multi-slash in result", () => {
    test.prop([arbBasePath], { numRuns: NUM_RUNS.thorough })(
      "result does not contain '/{2,}'",
      (base: string) => {
        const result = normalizeBase(base);

        expect(result).not.toMatch(/\/{2,}/);
      },
    );

    test.prop(
      [
        fc.oneof(
          fc.constant("//"),
          fc.constant("///"),
          fc.constant("//app//sub//"),
          fc.constant("/a///b////c"),
        ),
      ],
      { numRuns: NUM_RUNS.fast },
    )("handles hand-picked multi-slash inputs", (base: string) => {
      const result = normalizeBase(base);

      expect(result).not.toMatch(/\/{2,}/);
    });
  });

  describe("extractPath — leading slash guarantee", () => {
    test.prop([fc.string({ maxLength: 30 }), arbBasePath], {
      numRuns: NUM_RUNS.thorough,
    })("result always starts with '/'", (pathname: string, rawBase: string) => {
      const base = normalizeBase(rawBase);
      const result = extractPath(pathname, base);

      expect(result.startsWith("/")).toBe(true);
    });

    // NOTE: `extractPath` is intentionally NOT idempotent in the general case.
    // When the first call's output equals `base` — e.g.
    // `extractPath("/a/a", "/a") === "/a"` — the second call matches `base`
    // exactly and strips it again, yielding `"/"`. Each call normalises
    // "strip base prefix once from the given input". An idempotency property
    // would require special-casing `input === base` inside the function, which
    // is outside its contract. Only the leading-slash invariant above is
    // guaranteed.
  });

  describe("buildUrl — no double slash with normalized base", () => {
    test.prop([arbUrlPath, arbBasePath], { numRuns: NUM_RUNS.thorough })(
      "buildUrl(path, normalizeBase(base)) never contains '//'",
      (path: string, rawBase: string) => {
        const base = normalizeBase(rawBase);
        const url = buildUrl(path, base);

        expect(url).not.toMatch(/\/{2,}/);
      },
    );

    test.prop([arbUrlPath, arbBasePath], { numRuns: NUM_RUNS.standard })(
      "length-additivity when path starts with '/'",
      (path: string, rawBase: string) => {
        const base = normalizeBase(rawBase);

        expect(buildUrl(path, base)).toHaveLength(path.length + base.length);
      },
    );

    test.prop([arbUrlPath, arbBasePath], { numRuns: NUM_RUNS.standard })(
      "extractPath(buildUrl(path, base), base) === path",
      (path: string, rawBase: string) => {
        const base = normalizeBase(rawBase);
        const url = buildUrl(path, base);

        expect(extractPath(url, base)).toStrictEqual(path);
      },
    );
  });

  describe("urlToPath — total over valid HTTP URLs", () => {
    const arbAbsoluteUrl = fc
      .tuple(arbUrlPath, arbSearchString, arbHashString)
      .map(
        ([path, search, hash]) => `https://example.com${path}${search}${hash}`,
      );

    test.prop([arbAbsoluteUrl], { numRuns: NUM_RUNS.standard })(
      "returns string starting with '/'",
      (url: string) => {
        const result = urlToPath(url, "");

        expect(result.startsWith("/")).toBe(true);
      },
    );
  });

  describe("safelyEncodePath — idempotency", () => {
    test.prop([arbUrlPath], { numRuns: NUM_RUNS.thorough })(
      "safelyEncodePath(safelyEncodePath(p)) === safelyEncodePath(p)",
      (path: string) => {
        const once = safelyEncodePath(path);
        const twice = safelyEncodePath(once);

        expect(twice).toStrictEqual(once);
      },
    );
  });

  describe("safelyEncodePath — slash count preserved", () => {
    test.prop([arbUrlPath], { numRuns: NUM_RUNS.thorough })(
      "encode(p).split('/').length === p.split('/').length",
      (path: string) => {
        const encoded = safelyEncodePath(path);

        expect(encoded.split("/")).toHaveLength(path.split("/").length);
      },
    );
  });

  // #1920. The three properties above are each TRUE of the defect: the
  // corruption stabilises after one application, so idempotency holds; it adds
  // no slash, so the slash count holds; and the ASCII generator never emits a
  // "%", so the fixpoint holds. What none of them asks is whether the value the
  // router put INTO the path is the value it reads back out — which is the only
  // thing this function exists to protect.
  describe("safelyEncodePath — the param survives the round trip", () => {
    const router = createRouter([{ name: "files", path: "/files/:id" }]);
    const api = getPluginApi(router);

    test.prop([fc.string({ minLength: 1 })], { numRuns: NUM_RUNS.thorough })(
      "matchPath(safelyEncodePath(buildPath(p))).id === p.id",
      (id: string) => {
        const built = router.buildPath("files", { id });

        expect(api.matchPath(safelyEncodePath(built))?.params.id).toBe(id);
      },
    );

    // Why the second class #1920 moves is safe to move: the fix stopped
    // normalising "%41" to "A", and the matcher cannot tell the two apart.
    test("an escaped and a literal unreserved character decode alike", () => {
      expect(api.matchPath("/files/%41")?.params.id).toBe("A");
      expect(api.matchPath("/files/A")?.params.id).toBe("A");
      expect(api.matchPath("/files/%7Ex")?.params.id).toBe("~x");
      expect(api.matchPath("/files/~x")?.params.id).toBe("~x");
    });
  });

  // ⚠ The property above passes on a function that does NOTHING — measured, by
  // replacing `safelyEncodePath` with `return path`: `buildPath` already emits a
  // correctly encoded path, so a no-op cannot break the round trip. It proves
  // "does not corrupt", never "does encode". The whole suite was green on that
  // mutant, because every generator this file had excluded `%` and non-ASCII.
  // These three run over `arbEncodablePath` / `arbRawOnlyPath` and are what
  // actually holds the function to its job.
  describe("safelyEncodePath — over input that needs encoding", () => {
    test.prop([arbRawOnlyPath], { numRuns: NUM_RUNS.thorough })(
      "nothing needing an escape survives unescaped in the result",
      (path: string) => {
        // NOT `encodeURI(out) === out`: `encodeURI` is not idempotent on its own
        // output, since it escapes the `%` it just produced (caught by this very
        // property, on the real implementation, with counterexample "/ü").
        // Strip the escapes first — what remains must need none.
        const rest = safelyEncodePath(path).replaceAll(/%[0-9A-Fa-f]{2}/g, "");

        expect(encodeURI(rest)).toStrictEqual(rest);
      },
    );

    test.prop([arbEncodablePath], { numRuns: NUM_RUNS.thorough })(
      "every escape the input carries survives verbatim and in order",
      (path: string) => {
        const inEscapes: string[] = path.match(/%[0-9A-Fa-f]{2}/g) ?? [];
        const outEscapes: string[] =
          safelyEncodePath(path).match(/%[0-9A-Fa-f]{2}/g) ?? [];

        // Encoding a raw piece can ADD escapes, never drop or reorder the ones
        // already there — so the input's list is a subsequence of the output's.
        let cursor = 0;

        for (const escape of inEscapes) {
          cursor = outEscapes.indexOf(escape, cursor) + 1;

          expect(cursor).toBeGreaterThan(0);
        }
      },
    );

    test.prop([arbEncodablePath], { numRuns: NUM_RUNS.thorough })(
      "idempotent on input that actually exercises it",
      (path: string) => {
        const once = safelyEncodePath(path);

        expect(safelyEncodePath(once)).toStrictEqual(once);
      },
    );
  });

  describe("safelyEncodePath — ASCII fixpoint", () => {
    test.prop([arbAsciiPath], { numRuns: NUM_RUNS.thorough })(
      "ASCII-only paths are unchanged after encoding",
      (path: string) => {
        const encoded = safelyEncodePath(path);

        expect(encoded).toStrictEqual(path);
      },
    );
  });

  // #1921 shipped with functional cells and no property at all. The defect is
  // generative by nature — it fires on ANY relative URL whose query or fragment
  // happens to carry a "://" — so a generator is the natural guard, and the
  // literal cells only ever name four of the shapes it produces.
  describe("safeParseUrl — a relative URL stays relative", () => {
    // No "#" in the tail: it would legitimately open the fragment and move the
    // rest out of `search`, which is the parser working, not failing. (Found by
    // this property itself, counterexample ["/0", "#"].)
    const arbTail = fc
      .oneof(
        fc.constantFrom(
          "https://app.io/dashboard",
          "tauri://localhost/y",
          "app://bundle/admin",
          "a+b-c.d://h/p",
          "plain",
          "",
        ),
        fc.string({ maxLength: 12 }),
      )
      .filter((tail) => !tail.includes("#"));

    test.prop([arbUrlPath, arbTail], { numRuns: NUM_RUNS.thorough })(
      "a value in the query never becomes the pathname",
      (path: string, tail: string) => {
        const url = `${path}?next=${tail}`;

        expect(safeParseUrl(url)).toStrictEqual({
          pathname: path,
          search: `?next=${tail}`,
          hash: "",
        });
      },
    );

    test.prop([arbUrlPath, arbTail], { numRuns: NUM_RUNS.thorough })(
      "a value in the fragment never becomes the pathname either",
      (path: string, tail: string) => {
        const parsed = safeParseUrl(`${path}#${tail}`);

        expect(parsed.pathname).toStrictEqual(path);
        expect(parsed.hash).toStrictEqual(`#${tail}`);
      },
    );

    // The other pole: an ABSOLUTE URL must still lose scheme and authority,
    // whatever its own query then carries. Without this the property above is
    // satisfied by a parser that never strips anything.
    test.prop([arbUrlPath, arbTail], { numRuns: NUM_RUNS.thorough })(
      "an absolute URL still loses its scheme and authority",
      (path: string, tail: string) => {
        const parsed = safeParseUrl(`https://host.example${path}?next=${tail}`);

        expect(parsed.pathname).toStrictEqual(path);
      },
    );
  });

  describe("safeParseUrl — valid HTTP paths preserve pathname", () => {
    test.prop([arbUrlPath], { numRuns: NUM_RUNS.standard })(
      "parses valid paths to object with matching pathname",
      (path: string) => {
        const result = safeParseUrl(path);

        expect(result.pathname).toStrictEqual(path);
      },
    );
  });

  describe("safeParseUrl — accepts any scheme (desktop environments)", () => {
    test.prop([arbNonHttpProtocol], { numRuns: NUM_RUNS.fast })(
      "non-HTTP scheme URLs yield a parsed object — Electron/Tauri compat",
      (url: string) => {
        const result = safeParseUrl(url);

        // The parser is total: any string yields {pathname, search, hash}.
        expect(typeof result.pathname).toBe("string");
      },
    );
  });

  describe("safeParseUrl — pathname not polluted by search/hash", () => {
    test.prop([arbUrlPath, arbSearchString, arbHashString], {
      numRuns: NUM_RUNS.standard,
    })(
      "pathname equals the path portion regardless of search/hash",
      (path: string, search: string, hash: string) => {
        const fullUrl = `${path}${search}${hash}`;
        const result = safeParseUrl(fullUrl);

        expect(result.pathname).toStrictEqual(path);
      },
    );
  });

  describe("pushState — updates location.pathname", () => {
    beforeEach(() => {
      globalThis.history.pushState({}, "", "/");
    });

    test.prop([arbUrlPath], { numRuns: NUM_RUNS.standard })(
      "location.pathname equals path after pushState",
      (path: string) => {
        const state = makeMinimalState("test", path);

        pushState(state, path);

        expect(globalThis.location.pathname).toStrictEqual(path);
      },
    );
  });

  describe("replaceState — updates location.pathname", () => {
    beforeEach(() => {
      globalThis.history.pushState({}, "", "/");
    });

    test.prop([arbUrlPath], { numRuns: NUM_RUNS.standard })(
      "location.pathname equals path after replaceState",
      (path: string) => {
        const state = makeMinimalState("test", path);

        replaceState(state, path);

        expect(globalThis.location.pathname).toStrictEqual(path);
      },
    );
  });

  describe("updateBrowserState — push vs replace routing", () => {
    test.prop([arbFullState, arbUrlPath, fc.boolean()], {
      numRuns: NUM_RUNS.standard,
    })(
      "replace=true calls replaceState, replace=false calls pushState",
      (state, url, replace) => {
        const browser = createSpyBrowser();

        updateBrowserState(state, url, replace, browser);

        const calls = browser.getCalls();

        expect(calls).toHaveLength(1);
        expect(calls[0].method).toStrictEqual(
          replace ? "replaceState" : "pushState",
        );
        expect(calls[0].url).toStrictEqual(url);
      },
    );
  });

  describe("updateBrowserState — history state shape", () => {
    test.prop([arbFullState, arbUrlPath, fc.boolean()], {
      numRuns: NUM_RUNS.standard,
    })(
      "name, params, search, path are stored in history state",
      (state, url, replace) => {
        const browser = createSpyBrowser();

        updateBrowserState(state, url, replace, browser);

        const storedState = browser.getCalls()[0].state;

        expect(storedState).toStrictEqual({
          name: state.name,
          params: state.params,
          search: state.search,
          path: state.path,
        });
      },
    );
  });

  describe("getRouteFromEvent — valid state extraction", () => {
    test.prop(
      [
        fc.stringMatching(/^[a-z]{1,5}$/),
        fc.dictionary(
          fc.stringMatching(/^[a-z]{1,3}$/),
          fc.stringMatching(/^[a-z0-9]{1,5}$/),
          { minKeys: 0, maxKeys: 3 },
        ),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "synthesizes a State from valid history.state via api.makeState",
      (name: string, params: Params) => {
        const validState = { name, params, path: "/test" };
        const evt = createMockPopStateEvent(validState);
        const api = createMockPluginApi(undefined);
        const browser = createSpyBrowser();

        const result = getRouteFromEvent(evt, api, browser.getLocation());

        // Returns a State produced by api.makeState (#525). Source-of-truth
        // fields (name, params, path) come from history.state; the rest are
        // populated by the mock makeState.
        expect(result).toMatchObject({ name, params, path: "/test" });
      },
    );
  });

  describe("getRouteFromEvent — fallback to matchPath", () => {
    test.prop(
      [
        fc.stringMatching(/^[a-z]{1,5}$/),
        fc.dictionary(
          fc.stringMatching(/^[a-z]{1,3}$/),
          fc.stringMatching(/^[a-z0-9]{1,5}$/),
          { minKeys: 0, maxKeys: 3 },
        ),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "falls back to matchPath when history.state is invalid",
      (name: string, params: Params) => {
        const evt = createMockPopStateEvent(null);
        const matchResult = { name, params, path: "/matched" };
        const api = createMockPluginApi(matchResult);
        const browser = createSpyBrowser();

        const result = getRouteFromEvent(evt, api, browser.getLocation());

        // matchPath's mock returns a full State; assert structural fields.
        expect(result).toMatchObject({ name, params, path: "/matched" });
      },
    );
  });
});
