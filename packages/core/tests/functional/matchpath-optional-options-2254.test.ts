import { beforeEach, describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Router } from "@real-router/core/types";

/**
 * `RouterInternals.matchPath` honours its own optional parameter (#2254 row 1).
 *
 * The signature declares `options?: AnyOptions`, and the matcher reads
 * `rewritePathOnMatch` off the bag — so omitting it, which the type allows,
 * crashed the door while its `PluginApi` sibling answered the same call.
 *
 * ⚠ **A crash is not "stricter".** The parity census reported this as
 * `internal-stricter`, a verdict its own taxonomy calls benign. Refusing more is
 * safe; dereferencing an absent argument the signature permits is not.
 */
let router: Router;

describe("matchPath honours its optional options bag (#2254)", () => {
  beforeEach(async () => {
    router = createRouter([
      { name: "q", path: "/q?page" },
      { name: "u", path: "/u/:id" },
    ]);
    await router.start("/q");
  });

  it("answers when the bag is OMITTED, as its sibling does", () => {
    const internal = getInternals(router).matchPath("/u/7");

    expect(internal?.name).toBe("u");
    expect(internal?.params).toStrictEqual({ id: "7" });
  });

  it("CONTROL — the sibling answers the same call the same way", () => {
    const viaFacade = getPluginApi(router).matchPath("/u/7");
    const viaInternal = getInternals(router).matchPath("/u/7");

    expect(viaInternal?.name).toBe(viaFacade?.name);
    expect(viaInternal?.path).toBe(viaFacade?.path);
  });

  it("CONTROL — a bag that IS supplied still governs the match", () => {
    // ⚑ The discriminator for the default, and it needs an option whose effect
    // is OBSERVABLE: a cell built on one that changes nothing passes just as
    // well on a door that discards the argument. Measured — `strictTrailingSlash`
    // and `rewritePathOnMatch` leave this answer identical; `trailingSlash`
    // does not.
    const ctx = getInternals(router);
    const supplied = ctx.matchPath("/u/7", {
      ...ctx.getOptions(),
      trailingSlash: "always",
    } as never);

    expect(supplied?.path).toBe("/u/7/");
    expect(ctx.matchPath("/u/7")?.path).toBe("/u/7");
  });

  it("CONTROL — the query channel resolves identically on both doors", () => {
    // ⚠ Compared against the sibling, not a literal: the default bag governs
    // coercion too (`page` comes back as a NUMBER here), so a literal pins this
    // file to an option's current value rather than to the parity it is about.
    expect(getInternals(router).matchPath("/q?page=2")?.search).toStrictEqual(
      getPluginApi(router).matchPath("/q?page=2")?.search,
    );
  });
});
