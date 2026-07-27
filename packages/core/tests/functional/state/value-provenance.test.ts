import { describe, it, expect, afterEach } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Router, SearchParams } from "@real-router/core";

// #1554 — state equality must not depend on where the values came from.
// The URL direction yields PARSED scalars (`?page=2` → `2` number, `?flag` →
// `null`, `?a=1&a=2` → `[1, 2]`), the intent direction keeps whatever the caller
// supplied (`{ page: "2" }` stays a string). Both build the SAME `state.path`, so
// `areStatesEqual` / `isActiveRoute` must agree — before this fix they compared
// with `===` (and the hierarchical branch with a raw `!==`), so a URL-derived
// state and an intent-derived state on the same location came out UNEQUAL.
//
// Tolerance is deliberately narrow (see the "boundaries" block): only
// string/number/boolean values (and a singleton array against its scalar, which
// builds the same query string) compare across types. `null` / `undefined` /
// objects keep strict semantics — they build DIFFERENT URLs (`?a` vs `?a=`).

describe("param value provenance (#1554)", () => {
  let active: Router | undefined;

  afterEach(() => {
    if (active?.isActive()) {
      active.stop();
    }

    active = undefined;
  });

  const makeRouter = (): Router =>
    (active = createRouter([
      { name: "home", path: "/home" },
      { name: "x", path: "/x?page" },
      { name: "item", path: "/item/:id" },
      {
        name: "par",
        path: "/par",
        children: [{ name: "kid", path: "/kid/:k?tab" }],
      },
    ]));

  it("a URL-derived state equals the intent-derived state for the same location", async () => {
    const router = makeRouter();

    await router.start("/x?page=2");

    const fromUrl = router.getState()!;
    const fromIntent = getPluginApi(router).makeState("x", {}, { page: "2" });

    // Same location by construction — the paths are byte-identical.
    expect(fromIntent.path).toBe(fromUrl.path);
    expect(router.areStatesEqual(fromUrl, fromIntent, false)).toBe(true);
  });

  it("isActiveRoute matches a query value supplied as a string against a parsed one", async () => {
    const router = makeRouter();

    await router.start("/x?page=2");

    expect(router.isActiveRoute("x", {}, { page: "2" }, false, false)).toBe(
      true,
    );
  });

  it("isActiveRoute matches a path param supplied as a number against a decoded string", async () => {
    const router = makeRouter();

    await router.start("/item/123");

    // The URL decode always yields strings; a caller may well pass the number.
    // Both build `/item/123`.
    expect(router.isActiveRoute("item", { id: 123 })).toBe(true);
  });

  it("the hierarchical branch is provenance-tolerant too", async () => {
    const router = makeRouter();

    await router.start("/par/kid/9?tab=2");

    // Ancestor link with the descendant's query/path values written as strings.
    expect(router.isActiveRoute("par", {}, { tab: "2" }, false, false)).toBe(
      true,
    );
    expect(router.isActiveRoute("par", { k: 9 }, undefined, false, false)).toBe(
      true,
    );
  });

  describe("tolerance boundaries", () => {
    const equalOnX = async (
      left: SearchParams,
      right: SearchParams,
    ): Promise<boolean> => {
      const router = makeRouter();

      await router.start("/home");

      const api = getPluginApi(router);

      return router.areStatesEqual(
        api.makeState("x", {}, left),
        api.makeState("x", {}, right),
        false,
      );
    };

    it("equates a numeric string with a number (same query string)", async () => {
      await expect(equalOnX({ page: "2" }, { page: 2 })).resolves.toBe(true);
    });

    it("equates a boolean with its printed form", async () => {
      await expect(equalOnX({ page: "true" }, { page: true })).resolves.toBe(
        true,
      );
    });

    it("equates a singleton array with its scalar (both print `?page=1`)", async () => {
      await expect(equalOnX({ page: ["1"] }, { page: 1 })).resolves.toBe(true);
    });

    it("compares arrays element-wise across types", async () => {
      await expect(
        equalOnX({ page: ["1", "2"] }, { page: [1, 2] }),
      ).resolves.toBe(true);
    });

    it("keeps a multi-element array distinct from a joined string", async () => {
      // `["1","2"]` prints `?page=1&page=2`, `"1,2"` prints `?page=1%2C2` —
      // different URLs, so a String() flattening must NOT equate them.
      await expect(
        equalOnX({ page: ["1", "2"] }, { page: "1,2" }),
      ).resolves.toBe(false);
    });

    it("keeps null distinct from the empty string (`?page` vs `?page=`)", async () => {
      await expect(equalOnX({ page: null }, { page: "" })).resolves.toBe(false);
    });

    it("keeps a missing value distinct from a present one", async () => {
      await expect(
        equalOnX({ page: undefined }, { page: "undefined" }),
      ).resolves.toBe(false);
    });

    it("keeps distinct scalars distinct", async () => {
      await expect(equalOnX({ page: "2" }, { page: 3 })).resolves.toBe(false);
    });

    it("equates a scalar with a singleton array in either position", async () => {
      await expect(equalOnX({ page: 1 }, { page: ["1"] })).resolves.toBe(true);
    });

    it("rejects a scalar against a multi-element array", async () => {
      await expect(equalOnX({ page: 1 }, { page: ["1", "2"] })).resolves.toBe(
        false,
      );
    });

    it("does not equate an object with its printed form", async () => {
      const shape = { toString: () => "2" };

      await expect(
        equalOnX({ page: shape } as unknown as SearchParams, { page: "2" }),
      ).resolves.toBe(false);
    });
  });
});
