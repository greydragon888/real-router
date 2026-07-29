import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, afterEach, it, expect } from "vitest";

import { validationPlugin } from "../../src";

import type { Params, Router } from "@real-router/core";

/**
 * A route's `decodeParams` is USER code, and `matchPath` builds a state out of
 * whatever it returns (#1582).
 *
 * Bare core is tolerant here by design — it takes the bag as given, and the
 * shapes below commit silently: an array becomes `params { "0": "a" }`, a string
 * becomes `{ "0": "o", "1": "o", … }`, a `Map` and a prototyped object both
 * become `{}`. That is the "silent corruption" criterion core names for opting a
 * check IN to this plugin rather than into core itself.
 *
 * The check briefly went missing when `matchPath` moved onto the nav pipeline:
 * the call lived inside a `forwardState` dependency wrapper that the migration
 * deleted, and its removal was justified as dropping a check on a
 * router-produced intermediate. True of the matcher's output on that same line;
 * false of the decoder's.
 */
const withDecoder = (decoded: unknown): Router =>
  createRouter(
    [
      {
        name: "k",
        path: "/k?q",
        decodeParams: () => ({ params: decoded as Params, search: {} }),
      },
    ],
    { defaultRoute: "k" },
  );

class Custom {
  constructor(public a = "1") {}
}

describe("validation-plugin — a decoder's output is user input (#1582)", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
  });

  describe("rejects a bag that is not a plain object", () => {
    it.each([
      ["an array", ["a"]],
      ["a string", "oops"],
      ["a Map", new Map([["a", "1"]])],
      ["a class instance", new Custom()],
      ["an object with a custom prototype", Object.create({ inherited: "x" })],
    ])("%s", (_label, decoded) => {
      router = withDecoder(decoded);
      router.usePlugin(validationPlugin());

      expect(() => getPluginApi(router).matchPath("/k?q=1")).toThrow(
        /\[router\.matchPath\] Invalid routeParams/,
      );
    });

    it("names matchPath, not the wrapper the check used to live in", () => {
      router = withDecoder(["a"]);
      router.usePlugin(validationPlugin());

      // The pre-pipeline call sat inside a `forwardState` dependency wrapper and
      // reported `[router.forwardState]` for a fault raised on the matchPath
      // path — a caller reading that message looked at the wrong method.
      expect(() => getPluginApi(router).matchPath("/k?q=1")).toThrow(
        expect.objectContaining({
          message: expect.not.stringContaining("forwardState") as unknown,
        }),
      );
    });
  });

  describe("discrimination", () => {
    it("accepts a well-formed decoder output", () => {
      router = withDecoder({ a: "1" });
      router.usePlugin(validationPlugin());

      expect(getPluginApi(router).matchPath("/k?q=1")?.params).toStrictEqual({
        a: "1",
      });
    });

    it("does not fire for a route with no decoder at all", () => {
      router = createRouter([{ name: "k", path: "/k?q" }], {
        defaultRoute: "k",
      });
      router.usePlugin(validationPlugin());

      // The matcher's own output is router-produced and plain by construction,
      // so the check has nothing to say about it.
      expect(getPluginApi(router).matchPath("/k?q=1")?.search).toStrictEqual({
        q: 1,
      });
    });

    it("stays silent in bare core — the shape commits as before", () => {
      router = withDecoder(["a"]);

      expect(getPluginApi(router).matchPath("/k?q=1")?.params).toStrictEqual({
        0: "a",
      });
    });
  });
});
