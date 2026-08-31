import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

/**
 * A route named `""` is refused at registration (#1804).
 *
 * The rule and its wording are core's own, in `engine/validation/route-name.ts`
 * — reachable through `validateRoute`, which core exports for
 * `@real-router/validation-plugin`. These tests pin the always-on half, as
 * #1047 did for the reserved "@@" prefix and #1763 for dotted names.
 *
 * ⚑ The harm is not a route that cannot be addressed, it is a DIFFERENT TREE:
 * accepted, `{ name: "", children: [...] }` loses the parent and re-parents its
 * children to the root, where they answer to a name the author never wrote.
 * A verdict table comparing accept/reject cannot see that, so the tree shape is
 * asserted below rather than the refusal alone.
 */
describe('a route named "" is refused at registration (#1804)', () => {
  const MESSAGE = /Route name cannot be empty/;

  it("rejects it in the constructor", () => {
    expect(() => createRouter([{ name: "", path: "/a" }])).toThrow(MESSAGE);
  });

  it("names the constructor, as the dotted rule does at the same door", () => {
    // The wording is `validateRoute`'s, so with the plugin installed `add()`
    // reports the identical sentence. Measured: the plugin's RETROSPECTIVE
    // path reports its own `validateExistingRoutes` message instead, so the
    // claim here is about the two always-on name rules agreeing, not about
    // matching the plugin at this door.
    expect(() => createRouter([{ name: "", path: "/a" }])).toThrow(
      "[router.constructor] Route name cannot be empty",
    );
  });

  it("rejects it in add()", () => {
    const r = createRouter([{ name: "home", path: "/home" }]);

    expect(() => {
      getRoutesApi(r).add({ name: "", path: "/a" });
    }).toThrow(MESSAGE);

    r.dispose();
  });

  it("rejects it in replace()", () => {
    const r = createRouter([{ name: "home", path: "/home" }]);

    expect(() => {
      getRoutesApi(r).replace([{ name: "", path: "/a" }]);
    }).toThrow(MESSAGE);

    r.dispose();
  });

  it("rejects it nested in children", () => {
    const r = createRouter([{ name: "home", path: "/home" }]);

    expect(() => {
      getRoutesApi(r).add({
        name: "users",
        path: "/users",
        children: [{ name: "", path: "/x" }],
      });
    }).toThrow(MESSAGE);

    r.dispose();
  });

  it("leaves no child re-parented to the root", () => {
    const r = createRouter([{ name: "home", path: "/home" }]);

    expect(() => {
      getRoutesApi(r).add([
        { name: "", path: "/a", children: [{ name: "kid", path: "/kid" }] },
      ]);
    }).toThrow(MESSAGE);

    // The whole batch is refused before any build, so the child is not in the
    // tree under ANY name — the shape the accepting version produced.
    expect(getRoutesApi(r).has("kid")).toBe(false);
    expect(getRoutesApi(r).has("")).toBe(false);

    r.dispose();
  });

  it("CONTROL — a named parent still nests its children", () => {
    const r = createRouter([{ name: "home", path: "/home" }]);

    getRoutesApi(r).add([
      { name: "ok", path: "/a", children: [{ name: "kid", path: "/kid" }] },
    ]);

    expect(getRoutesApi(r).has("ok.kid")).toBe(true);
    expect(getRoutesApi(r).has("kid")).toBe(false);

    r.dispose();
  });

  it('CONTROL — remove("") and update("") are untouched by the rule', () => {
    const r = createRouter([{ name: "home", path: "/home" }]);

    // The empty name means the ROOT node at these doors, which is why the
    // validation plugin admits it there and this lift does not reach them:
    // measured, both stay no-ops that report a miss rather than refusing.
    expect(() => {
      getRoutesApi(r).remove("");
    }).not.toThrow();
    expect(() => {
      getRoutesApi(r).update("", { forwardTo: "home" });
    }).not.toThrow();

    r.dispose();
  });
});
