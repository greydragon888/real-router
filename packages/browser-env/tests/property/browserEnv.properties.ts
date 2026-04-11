import { fc, test } from "@fast-check/vitest";

import {
  NUM_RUNS,
  makeMinimalState,
  arbBasePath,
  arbUrlPath,
  arbNonHttpProtocol,
  arbAsciiPath,
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
} from "../../src";
import {
  updateBrowserState,
  getRouteFromEvent,
} from "../../src/popstate-utils";
import { safeParseUrl } from "../../src/url-parsing";

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

  describe("safelyEncodePath — ASCII fixpoint", () => {
    test.prop([arbAsciiPath], { numRuns: NUM_RUNS.thorough })(
      "ASCII-only paths are unchanged after encoding",
      (path: string) => {
        const encoded = safelyEncodePath(path);

        expect(encoded).toStrictEqual(path);
      },
    );
  });

  describe("safeParseUrl — valid HTTP paths return non-null URL", () => {
    test.prop([arbUrlPath], { numRuns: NUM_RUNS.standard })(
      "parses valid paths to URL with matching pathname",
      (path: string) => {
        const result = safeParseUrl(path, "property-test");

        expect(result).not.toBeNull();

        if (result !== null) {
          expect(result.pathname).toStrictEqual(path);
        }
      },
    );
  });

  describe("safeParseUrl — rejects non-HTTP protocols", () => {
    test.prop([arbNonHttpProtocol], { numRuns: NUM_RUNS.fast })(
      "non-HTTP protocol URLs return null",
      (url: string) => {
        const result = safeParseUrl(url, "property-test");

        expect(result).toBeNull();
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
        const result = safeParseUrl(fullUrl, "property-test");

        expect(result).not.toBeNull();

        if (result !== null) {
          expect(result.pathname).toStrictEqual(path);
        }
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
      "only name, params, path are stored in history state",
      (state, url, replace) => {
        const browser = createSpyBrowser();

        updateBrowserState(state, url, replace, browser);

        const storedState = browser.getCalls()[0].state;

        expect(storedState).toStrictEqual({
          name: state.name,
          params: state.params,
          path: state.path,
          context: {},
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
      "extracts name and params from valid history.state",
      (name: string, params: Params) => {
        const validState = { name, params, path: "/test" };
        const evt = createMockPopStateEvent(validState);
        const api = createMockPluginApi(undefined);
        const browser = createSpyBrowser();

        const result = getRouteFromEvent(evt, api, browser);

        expect(result).toStrictEqual({ name, params });
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

        const result = getRouteFromEvent(evt, api, browser);

        expect(result).toStrictEqual({ name, params });
      },
    );
  });
});
