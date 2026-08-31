import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi, getPluginApi } from "@real-router/core/api";

/**
 * A route path carrying `//` is refused at registration (#2010).
 *
 * ⚑ Accepted, the route builds the URL it was declared for and then refuses to
 * match it: `buildPath` printed `/a//b` while `matchPath("/a//b")` answered
 * `undefined`. That is core contradicting itself, not a strict spelling rule.
 *
 * ⚠ Refused by the MATCHER backstop, beside #1154's non-ASCII static and
 * #1153's duplicate path — not by lifting the route-tree gate's clause. The
 * gate is plugin-only and its reject recipes are kept out of the main chunk
 * deliberately (#1526), so calling it from registration would have shipped
 * them: `validation-bundle-isolation.test.ts` fails on exactly that, which is
 * how this landed here.
 */
describe("a path with double slashes is refused at registration (#2010)", () => {
  const MESSAGE = /Double slashes are not allowed/;

  it("rejects it in the constructor", () => {
    expect(() => createRouter([{ name: "a", path: "/a//b" }])).toThrow(MESSAGE);
  });

  it("names the matcher backstop and quotes the path", () => {
    expect(() => createRouter([{ name: "a", path: "/a//b" }])).toThrow(
      '[SegmentMatcher.registerTree] Double slashes are not allowed in path "/a//b": the route would build a URL its own matcher refuses. Remove the empty segment.',
    );
  });

  it("rejects it in add()", () => {
    const r = createRouter([{ name: "home", path: "/home" }]);

    expect(() => {
      getRoutesApi(r).add({ name: "a", path: "/a//b" });
    }).toThrow(MESSAGE);

    r.dispose();
  });

  it("rejects it in replace()", () => {
    const r = createRouter([{ name: "home", path: "/home" }]);

    expect(() => {
      getRoutesApi(r).replace([{ name: "a", path: "/a//b" }]);
    }).toThrow(MESSAGE);

    r.dispose();
  });

  it("rejects it nested in children", () => {
    const r = createRouter([{ name: "home", path: "/home" }]);

    expect(() => {
      getRoutesApi(r).add({
        name: "users",
        path: "/users",
        children: [{ name: "kid", path: "/x//y" }],
      });
    }).toThrow(MESSAGE);

    r.dispose();
  });

  it("CONTROL — one leading and one trailing slash each stay legal", () => {
    const r = createRouter([
      { name: "lead", path: "/lead" },
      { name: "trail", path: "/trail/" },
      { name: "root", path: "/" },
    ]);

    expect(r.buildPath("lead")).toBe("/lead");

    r.dispose();
  });

  it("CONTROL — what survives registration round-trips", () => {
    const r = createRouter([
      { name: "a", path: "/a/b" },
      { name: "home", path: "/home" },
    ]);

    const built = r.buildPath("a");

    expect(built).toBe("/a/b");
    expect(getPluginApi(r).matchPath(built)?.name).toBe("a");

    r.dispose();
  });
});
