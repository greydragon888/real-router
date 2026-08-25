// #1904 — what core HANDS OUT before its own drop runs.
//
// `matchPath` builds the query bag itself, by parsing the URL, and the parser
// creates an own `"__proto__"` key DELIBERATELY (#855 / #1293) — writing it any
// other way would swap the parsed object's own prototype. The drop then happens
// at the channel entry, which sits BELOW the two seams that hand the bag to
// application code: a route's `decodeParams`, and every `forwardState`
// interceptor on the URL direction.
//
// So core handed out a container it will not publish. The hazard is the
// consumer's merge, not core's own write: `?__proto__` alone parses to `null`
// and `?__proto__=1&__proto__=2` to an array, and a decoder folding that bag
// into an object of its own with `Object.assign` (or a `for…in` copy) has that
// object's prototype replaced, silently. A spread is safe — it DEFINES.
//
// ⚠ These cells assert what a seam RECEIVES, never what gets committed. That is
// the whole discipline here and it is measured, not stylistic: the committed
// state was already correct before the fix, so every commit-shaped assertion is
// green on both sides and discriminates nothing. Reverting the drop must red
// this file; a trial of the fix broke 0 of 4584 tests, which is exactly why it
// could not ship without these.

import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Params, SearchParams } from "@real-router/core/types";

const UNSAFE = "__proto__";

/** Own-ness, asked of the bag a seam was actually handed. */
const carriesUnsafe = (bag: object): boolean => Object.hasOwn(bag, UNSAFE);

/**
 * One router whose route records, per seam, the bag it was given.
 *
 * Both codecs are declared and an interceptor is registered, so a single
 * `matchPath` exercises every seam on the URL direction in one pass.
 */
function seamRecorder() {
  const seen: Record<string, { unsafe: boolean; keys: string[] }> = {};
  const note = (seam: string, bag: object): void => {
    seen[seam] = { unsafe: carriesUnsafe(bag), keys: Object.keys(bag) };
  };

  const router = createRouter(
    [
      {
        name: "p",
        path: "/p?a",
        decodeParams: (channels: { params: Params; search: SearchParams }) => {
          note("decodeParams", channels.search);

          return channels;
        },
        encodeParams: (channels: { params: Params; search: SearchParams }) => {
          note("encodeParams", channels.search);

          return channels;
        },
      },
    ],
    { queryParamsMode: "loose" },
  );

  const api = getPluginApi(router);

  api.addInterceptor("forwardState", (next, name, params, search) => {
    note("forwardState.in", search ?? {});

    const result = next(name, params, search);

    note("forwardState.out", result.search ?? {});

    return result;
  });

  return { router, api, seen };
}

/**
 * The PATH channel's twin fixture: a route whose slot is literally named
 * `__proto__`. Registration accepts it, `/q/zzz` matches, and the matcher writes
 * the captured segment under that name.
 */
function pathSlotRecorder() {
  const seen: Record<string, { unsafe: boolean; keys: string[] }> = {};
  const note = (seam: string, bag: object): void => {
    seen[seam] = { unsafe: carriesUnsafe(bag), keys: Object.keys(bag) };
  };

  const router = createRouter([
    {
      name: "q",
      path: "/q/:__proto__",
      decodeParams: (channels: { params: Params; search: SearchParams }) => {
        note("decodeParams", channels.params);

        return channels;
      },
    },
  ]);

  const api = getPluginApi(router);

  api.addInterceptor("forwardState", (next, name, params, search) => {
    note("forwardState.in", params);

    return next(name, params, search);
  });

  return { router, api, seen };
}

describe("core hands the URL-direction seams an already-clean bag (#1904)", () => {
  it("decodeParams does not receive an own __proto__", () => {
    const { api, seen } = seamRecorder();

    api.matchPath("/p?a=1&__proto__=2");

    expect(seen.decodeParams.unsafe).toBe(false);
  });

  it("a forwardState interceptor does not receive one either, in or out", () => {
    const { api, seen } = seamRecorder();

    api.matchPath("/p?a=1&__proto__=2");

    expect({
      in: seen["forwardState.in"].unsafe,
      out: seen["forwardState.out"].unsafe,
    }).toStrictEqual({ in: false, out: false });
  });

  it("the ORDINARY key survives — the drop takes one name, not the bag", () => {
    // Without this a `return {}` implementation passes every cell above.
    const { api, seen } = seamRecorder();

    api.matchPath("/p?a=1&__proto__=2");

    expect(seen.decodeParams.keys).toStrictEqual(["a"]);
  });

  it("CONTROL — encodeParams was ALREADY clean and must stay so", () => {
    // The sibling codec on the same route config is the control precisely
    // because it is green on both sides of the fix: it proves the fixture
    // reaches a codec at all, and pins the asymmetry closed rather than
    // inverted.
    const { api, seen } = seamRecorder();

    api.matchPath("/p?a=1&__proto__=2");

    expect(seen.encodeParams.unsafe).toBe(false);
  });

  it("the PATH channel is cleaned too — a `:__proto__` slot (#1904)", () => {
    // ⚠ Written because the first revision of this fix cleaned `search` ALONE,
    // and this file was green on that revision: removing the `params` half left
    // all five cells passing. The probe that "showed params clean" used the
    // query fixture above, which has no path slot by that name — it never built
    // the shape it claimed to clear.
    const { api, seen } = pathSlotRecorder();

    api.matchPath("/q/zzz");

    expect({
      decoder: seen.decodeParams.unsafe,
      seam: seen["forwardState.in"].unsafe,
    }).toStrictEqual({ decoder: false, seam: false });
  });

  it("the path channel's cleaned bag AGREES with the committed one", () => {
    // The decoder used to see `["__proto__"]` where the commit had `[]` — one
    // parse, two answers. Both are `[]` now, which is the point: the seam is
    // handed what will actually be published.
    const { api, seen } = pathSlotRecorder();

    const state = api.matchPath("/q/zzz");

    expect({
      decoder: seen.decodeParams.keys,
      committed: Object.keys(state?.params ?? {}),
    }).toStrictEqual({ decoder: [], committed: [] });
  });

  it("CONTROL — the hazard is real: the parser DOES produce the own key", () => {
    // Without this the cells above could pass because no `__proto__` ever
    // entered the bag — a fixture that never builds the shape it claims to
    // stop. `parseQueryString` is core's own parser, reached through the
    // matcher; asking it directly is what proves the key exists to be dropped.
    const bag: Record<string, unknown> = {};

    Object.defineProperty(bag, UNSAFE, {
      value: "2",
      writable: true,
      enumerable: true,
      configurable: true,
    });

    expect(carriesUnsafe(bag)).toBe(true);
    expect(Object.assign({}, bag)).toStrictEqual({});
  });
});
