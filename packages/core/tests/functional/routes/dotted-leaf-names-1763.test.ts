import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

/**
 * A route name carrying a dot — `{ name: "users.view" }` where the nesting
 * belongs in `children` or `{ parent }` — is refused by bare core (#1763).
 *
 * The rule, the wording and the code were already in core
 * (`engine/validation/route-batch.ts`), reachable only through `validateRoute`,
 * which core exports for `@real-router/validation-plugin` and never calls
 * itself. So the spelling was invalid under the project's own validation layer
 * while bare core accepted it; these tests pin the always-on half, the same
 * asymmetry #1047 closed for the reserved "@@" prefix.
 *
 * Why it is refused rather than tolerated-and-corrected: a dotted LEAF is a
 * standalone node whose name merely LOOKS like a path through the tree, and
 * five predicates across four packages read that resemblance as ancestry —
 * `isActiveRoute` (#1763), `remove()`'s config purge (#1757), and the `add` /
 * `buildPath` halves of #1194. Two of the five (`route-utils`'s exported
 * `areRoutesRelated`, `solid`'s `isRouteActive`) take names only and have no
 * tree to consult, so no local fix can reach them. Refusing to create the shape
 * makes all five correct by construction.
 */
describe("a dotted route name is refused at registration (#1763)", () => {
  const MESSAGE = /cannot contain dots/;

  it("rejects it in the constructor", () => {
    expect(() =>
      createRouter([
        { name: "users", path: "/users" },
        { name: "users.view", path: "/view" },
      ]),
    ).toThrow(MESSAGE);
  });

  it("names the constructor, matching what the validation plugin reports", () => {
    expect(() => createRouter([{ name: "users.view", path: "/view" }])).toThrow(
      '[router.constructor] Route name "users.view" cannot contain dots. Use children array or { parent } option in addRoute() instead.',
    );
  });

  it("rejects it in add()", () => {
    const r = createRouter([{ name: "users", path: "/users" }]);

    expect(() => {
      getRoutesApi(r).add({ name: "users.view", path: "/view" });
    }).toThrow(MESSAGE);

    r.dispose();
  });

  it("rejects it in add() with a { parent } option", () => {
    const r = createRouter([{ name: "users", path: "/users" }]);

    expect(() => {
      getRoutesApi(r).add({ name: "a.b", path: "/ab" }, { parent: "users" });
    }).toThrow(MESSAGE);

    r.dispose();
  });

  it("rejects it in replace()", () => {
    const r = createRouter([{ name: "users", path: "/users" }]);

    expect(() => {
      getRoutesApi(r).replace([
        { name: "users", path: "/users" },
        { name: "users.view", path: "/view" },
      ]);
    }).toThrow(MESSAGE);

    r.dispose();
  });

  it("rejects a dotted CHILD name too — the check reads the bare leaf", () => {
    const r = createRouter([{ name: "home", path: "/home" }]);

    expect(() => {
      getRoutesApi(r).add({
        name: "users",
        path: "/users",
        children: [{ name: "a.b", path: "/ab" }],
      });
    }).toThrow(MESSAGE);

    r.dispose();
  });

  describe("the tree is left untouched — the refusal is prepare-time", () => {
    it("add() of a batch with one dotted name adds nothing", () => {
      const r = createRouter([{ name: "home", path: "/home" }]);

      expect(() => {
        getRoutesApi(r).add([
          { name: "ok", path: "/ok" },
          { name: "not.ok", path: "/notok" },
        ]);
      }).toThrow(MESSAGE);

      expect(getRoutesApi(r).has("ok")).toBe(false);
      expect(getRoutesApi(r).has("home")).toBe(true);

      r.dispose();
    });

    it("replace() with one dotted name keeps the old tree", () => {
      const r = createRouter([{ name: "home", path: "/home" }]);

      expect(() => {
        getRoutesApi(r).replace([{ name: "not.ok", path: "/notok" }]);
      }).toThrow(MESSAGE);

      expect(getRoutesApi(r).has("home")).toBe(true);

      r.dispose();
    });
  });

  describe("CONTROLs — what stays legal", () => {
    it("nesting spelled with children is the supported form", () => {
      const r = createRouter([
        { name: "home", path: "/home" },
        {
          name: "users",
          path: "/users",
          children: [{ name: "view", path: "/view" }],
        },
      ]);

      expect(getRoutesApi(r).has("users.view")).toBe(true);
      expect(r.buildPath("users.view")).toBe("/users/view");

      r.dispose();
    });

    it("a dotted name is still how you ADDRESS a nested route", async () => {
      const r = createRouter(
        [
          { name: "home", path: "/home" },
          {
            name: "users",
            path: "/users",
            children: [{ name: "view", path: "/view" }],
          },
        ],
        { allowNotFound: true },
      );

      await r.start("/home");
      await r.navigate("users.view");

      expect(r.getState()?.name).toBe("users.view");
      // …and the ancestry predicate is now correct BY CONSTRUCTION: the only
      // tree that can produce this name is one where `users` really is an
      // ancestor.
      expect(r.isActiveRoute("users")).toBe(true);

      r.dispose();
    });

    it("the migration is EXACT — `~` keeps both the dotted name and the flat path", () => {
      // Plain nesting moves the URL (`/view` becomes `/users/view`), so a route
      // that needed the flat spelling's path would look stranded. The absolute
      // marker answers it: same dotted name, same path as before. This is what
      // makes the refusal cost no capability, so it is pinned rather than
      // asserted in the changeset alone.
      const r = createRouter([
        {
          name: "users",
          path: "/users",
          children: [{ name: "view", path: "~/view" }],
        },
      ]);

      expect(getRoutesApi(r).has("users.view")).toBe(true);
      expect(r.buildPath("users.view")).toBe("/view");

      r.dispose();
    });

    it("a dotted name still ADDRESSES a nested route in every CRUD entry point", () => {
      // The refusal is on a route DEFINITION's own name. Every place that takes
      // a name as a REFERENCE keeps accepting the dotted form — that is the
      // supported way to name a nested route, and catching it here would have
      // been the over-reach this boundary pins against.
      const r = createRouter([
        { name: "home", path: "/home" },
        {
          name: "users",
          path: "/users",
          children: [{ name: "view", path: "/view" }],
        },
      ]);
      const routes = getRoutesApi(r);

      expect(routes.get("users.view")?.path).toBe("/view");

      routes.update("users.view", { defaultParams: { k: "v" } });

      expect(routes.get("users.view")?.defaultParams).toStrictEqual({ k: "v" });

      routes.add({ name: "tab", path: "/tab" }, { parent: "users.view" });

      expect(routes.has("users.view.tab")).toBe(true);

      routes.remove("users.view.tab");

      expect(routes.has("users.view.tab")).toBe(false);

      r.dispose();
    });

    it("a hyphen namesake was never the same thing and is untouched", () => {
      const r = createRouter([
        { name: "users", path: "/users" },
        { name: "users-admin", path: "/ua" },
      ]);

      expect(getRoutesApi(r).has("users-admin")).toBe(true);

      r.dispose();
    });

    it("core's own reserved names still pass — they carry no dot and have their own guard", async () => {
      const r = createRouter([{ name: "home", path: "/home" }], {
        allowNotFound: true,
      });

      await r.start("/nope");

      expect(r.getState()?.name).toBe("@@router/UNKNOWN_ROUTE");

      r.dispose();
    });
  });
});
