import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

/**
 * #1303: `caseSensitive` is honoured end-to-end by the engine but was severed at
 * the core seam — `Options` had no field and `deriveMatcherOptions` never mapped
 * it, so `createRouter({ caseSensitive: false })` was silently ignored. These
 * tests exercise the option through the PUBLIC `createRouter` API (not white-box),
 * covering the engine's 5 dormant branches: match cache + traverse + registration
 * cache keys. Default stays case-sensitive (opt-in).
 */
describe("core/routes/caseSensitive option (#1303)", () => {
  it("caseSensitive: false — a mixed-case URL matches a lower-case static route", () => {
    const router = createRouter([{ name: "team", path: "/team" }], {
      caseSensitive: false,
    });

    expect(getPluginApi(router).matchPath("/Team")?.name).toBe("team");
    expect(getPluginApi(router).matchPath("/TEAM")?.name).toBe("team");
    // exact case still matches
    expect(getPluginApi(router).matchPath("/team")?.name).toBe("team");

    router.stop();
  });

  it("caseSensitive: false — matches nested routes case-insensitively (trie traverse)", () => {
    const router = createRouter(
      [
        {
          name: "users",
          path: "/Users",
          children: [{ name: "settings", path: "/Settings" }],
        },
      ],
      { caseSensitive: false },
    );

    expect(getPluginApi(router).matchPath("/users/settings")?.name).toBe(
      "users.settings",
    );
    expect(getPluginApi(router).matchPath("/USERS/SETTINGS")?.name).toBe(
      "users.settings",
    );

    router.stop();
  });

  it("caseSensitive: false — dynamic param VALUES keep their original case", () => {
    const router = createRouter([{ name: "user", path: "/user/:id" }], {
      caseSensitive: false,
    });

    // static "/user" matches "/User" insensitively, but the :id value is preserved
    expect(getPluginApi(router).matchPath("/User/AbC")?.params).toStrictEqual({
      id: "AbC",
    });

    router.stop();
  });

  it("default (caseSensitive: true) — a mixed-case URL does NOT match", () => {
    const router = createRouter([{ name: "team", path: "/team" }]);

    expect(getPluginApi(router).matchPath("/Team")).toBeUndefined();
    expect(getPluginApi(router).matchPath("/team")?.name).toBe("team");

    router.stop();
  });
});
