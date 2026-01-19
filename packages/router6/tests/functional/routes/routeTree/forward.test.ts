import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getConfig } from "../../../../modules/internals";
import { createTestRouter } from "../../../helpers";

import type { Router } from "router6";

let router: Router;

describe("core/routes/routeTree/forward", () => {
  beforeEach(() => {
    router = createTestRouter();
    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("validation", () => {
    it("should throw if source route does not exist", () => {
      router.addRoute({ name: "target", path: "/target" });

      expect(() => router.forward("nonexistent", "target")).toThrowError(
        '[router6] forward: source route "nonexistent" does not exist',
      );
    });

    it("should throw if target route does not exist", () => {
      router.addRoute({ name: "source", path: "/source" });

      expect(() => router.forward("source", "nonexistent")).toThrowError(
        '[router6] forward: target route "nonexistent" does not exist',
      );
    });

    it("should throw if target route requires params not in source", () => {
      router.addRoute({ name: "fwd-static-source", path: "/fwd-static" });
      router.addRoute({ name: "fwd-param-target", path: "/fwd-param/:id" });

      expect(() =>
        router.forward("fwd-static-source", "fwd-param-target"),
      ).toThrowError(
        '[router6] forward: target route "fwd-param-target" requires params [id] that are not available in source route "fwd-static-source"',
      );
    });

    it("should throw if target route requires multiple params not in source", () => {
      router.addRoute({ name: "fwd-list-source", path: "/fwd-list" });
      router.addRoute({
        name: "fwd-item-target",
        path: "/fwd-items/:category/:id",
      });

      expect(() =>
        router.forward("fwd-list-source", "fwd-item-target"),
      ).toThrowError(
        '[router6] forward: target route "fwd-item-target" requires params [category, id] that are not available in source route "fwd-list-source"',
      );
    });

    it("should throw if target route requires splat param not in source", () => {
      router.addRoute({ name: "fwd-root-source", path: "/fwd-root" });
      router.addRoute({ name: "fwd-files-target", path: "/fwd-files/*path" });

      expect(() =>
        router.forward("fwd-root-source", "fwd-files-target"),
      ).toThrowError(
        '[router6] forward: target route "fwd-files-target" requires params [path] that are not available in source route "fwd-root-source"',
      );
    });

    it("should allow forward when source has all required params", () => {
      router.addRoute({ name: "oldUser", path: "/old-user/:id" });
      router.addRoute({ name: "newUser", path: "/new-user/:id" });

      expect(() => router.forward("oldUser", "newUser")).not.toThrowError();
      expect(getConfig(router).forwardMap.oldUser).toBe("newUser");
    });

    it("should allow forward when source has more params than target", () => {
      router.addRoute({ name: "detail", path: "/items/:category/:id" });
      router.addRoute({ name: "category", path: "/categories/:category" });

      expect(() => router.forward("detail", "category")).not.toThrowError();
      expect(getConfig(router).forwardMap.detail).toBe("category");
    });

    it("should allow forward between static routes", () => {
      router.addRoute({ name: "oldPage", path: "/old-page" });
      router.addRoute({ name: "newPage", path: "/new-page" });

      expect(() => router.forward("oldPage", "newPage")).not.toThrowError();
      expect(getConfig(router).forwardMap.oldPage).toBe("newPage");
    });

    it("should allow forward for nested routes with matching params", () => {
      router.addRoute({
        name: "fwd-members",
        path: "/fwd-members/:memberId",
        children: [{ name: "details", path: "/details" }],
      });
      router.addRoute({
        name: "fwd-profiles",
        path: "/fwd-profiles/:memberId",
        children: [{ name: "info", path: "/info" }],
      });

      // fwd-members.details has :memberId from parent
      // fwd-profiles.info has :memberId from parent
      expect(() =>
        router.forward("fwd-members.details", "fwd-profiles.info"),
      ).not.toThrowError();
    });

    it("should throw for nested route with additional params in target", () => {
      router.addRoute({
        name: "fwd-teams",
        path: "/fwd-teams",
        children: [{ name: "all", path: "/all" }],
      });
      router.addRoute({
        name: "fwd-orgs",
        path: "/fwd-orgs/:orgId",
        children: [{ name: "info", path: "/info" }],
      });

      // fwd-teams.all has no params
      // fwd-orgs.info has :orgId from parent
      expect(() =>
        router.forward("fwd-teams.all", "fwd-orgs.info"),
      ).toThrowError(
        '[router6] forward: target route "fwd-orgs.info" requires params [orgId] that are not available in source route "fwd-teams.all"',
      );
    });
  });

  describe("matchPath integration", () => {
    it("should work correctly with valid forward", () => {
      router.addRoute({ name: "oldUser", path: "/old-user/:id" });
      router.addRoute({ name: "newUser", path: "/new-user/:id" });
      router.forward("oldUser", "newUser");

      const state = router.matchPath("/old-user/123");

      expect(state?.name).toBe("newUser");
      expect(state?.params.id).toBe("123");
    });

    it("should preserve params when forwarding", () => {
      router.addRoute({ name: "legacy", path: "/legacy/:category/:item" });
      router.addRoute({ name: "modern", path: "/modern/:category/:item" });
      router.forward("legacy", "modern");

      const state = router.matchPath("/legacy/books/123");

      expect(state?.name).toBe("modern");
      expect(state?.params.category).toBe("books");
      expect(state?.params.item).toBe("123");
    });
  });

  describe("forwardTo property validation", () => {
    describe("target in existing tree", () => {
      it("should throw if target route requires params not in source", () => {
        router.addRoute({ name: "fwdto-target", path: "/fwdto-target/:id" });

        expect(() =>
          router.addRoute({
            name: "fwdto-source",
            path: "/fwdto-source",
            forwardTo: "fwdto-target",
          }),
        ).toThrowError(
          '[router.addRoute] forwardTo target "fwdto-target" requires params [id] that are not available in source route "fwdto-source"',
        );
      });

      it("should throw if target requires multiple params not in source", () => {
        router.addRoute({
          name: "fwdto-multi-target",
          path: "/fwdto-multi/:category/:id",
        });

        expect(() =>
          router.addRoute({
            name: "fwdto-multi-source",
            path: "/fwdto-multi-source",
            forwardTo: "fwdto-multi-target",
          }),
        ).toThrowError(
          '[router.addRoute] forwardTo target "fwdto-multi-target" requires params [category, id] that are not available in source route "fwdto-multi-source"',
        );
      });

      it("should throw if target requires splat param not in source", () => {
        router.addRoute({
          name: "fwdto-splat-target",
          path: "/fwdto-splat/*path",
        });

        expect(() =>
          router.addRoute({
            name: "fwdto-splat-source",
            path: "/fwdto-splat-source",
            forwardTo: "fwdto-splat-target",
          }),
        ).toThrowError(
          '[router.addRoute] forwardTo target "fwdto-splat-target" requires params [path] that are not available in source route "fwdto-splat-source"',
        );
      });

      it("should allow forwardTo when source has all required params", () => {
        router.addRoute({ name: "fwdto-new", path: "/fwdto-new/:id" });

        expect(() =>
          router.addRoute({
            name: "fwdto-old",
            path: "/fwdto-old/:id",
            forwardTo: "fwdto-new",
          }),
        ).not.toThrowError();

        expect(getConfig(router).forwardMap["fwdto-old"]).toBe("fwdto-new");
      });

      it("should allow forwardTo when source has more params than target", () => {
        router.addRoute({
          name: "fwdto-category",
          path: "/fwdto-category/:category",
        });

        expect(() =>
          router.addRoute({
            name: "fwdto-detail",
            path: "/fwdto-detail/:category/:id",
            forwardTo: "fwdto-category",
          }),
        ).not.toThrowError();

        expect(getConfig(router).forwardMap["fwdto-detail"]).toBe(
          "fwdto-category",
        );
      });

      it("should allow forwardTo between static routes", () => {
        router.addRoute({
          name: "fwdto-new-static",
          path: "/fwdto-new-static",
        });

        expect(() =>
          router.addRoute({
            name: "fwdto-old-static",
            path: "/fwdto-old-static",
            forwardTo: "fwdto-new-static",
          }),
        ).not.toThrowError();

        expect(getConfig(router).forwardMap["fwdto-old-static"]).toBe(
          "fwdto-new-static",
        );
      });

      it("should throw for nested route with additional params in target", () => {
        router.addRoute({
          name: "fwdto-nested-target",
          path: "/fwdto-nested-target/:orgId",
          children: [{ name: "info", path: "/info" }],
        });

        expect(() =>
          router.addRoute({
            name: "fwdto-nested-source",
            path: "/fwdto-nested-source",
            children: [
              {
                name: "all",
                path: "/all",
                forwardTo: "fwdto-nested-target.info",
              },
            ],
          }),
        ).toThrowError(
          '[router.addRoute] forwardTo target "fwdto-nested-target.info" requires params [orgId] that are not available in source route "fwdto-nested-source.all"',
        );
      });
    });

    describe("target in same batch", () => {
      it("should throw if target in batch requires params not in source", () => {
        expect(() =>
          router.addRoute([
            { name: "batch-target", path: "/batch-target/:id" },
            {
              name: "batch-source",
              path: "/batch-source",
              forwardTo: "batch-target",
            },
          ]),
        ).toThrowError(
          '[router.addRoute] forwardTo target "batch-target" requires params [id] that are not available in source route "batch-source"',
        );
      });

      it("should allow forwardTo in batch when params match", () => {
        expect(() =>
          router.addRoute([
            { name: "batch-new", path: "/batch-new/:id" },
            {
              name: "batch-old",
              path: "/batch-old/:id",
              forwardTo: "batch-new",
            },
          ]),
        ).not.toThrowError();

        expect(getConfig(router).forwardMap["batch-old"]).toBe("batch-new");
      });

      it("should throw for nested batch routes with param mismatch", () => {
        expect(() =>
          router.addRoute([
            {
              name: "batch-parent",
              path: "/batch-parent/:parentId",
              children: [{ name: "child", path: "/child" }],
            },
            {
              name: "batch-static",
              path: "/batch-static",
              forwardTo: "batch-parent.child",
            },
          ]),
        ).toThrowError(
          '[router.addRoute] forwardTo target "batch-parent.child" requires params [parentId] that are not available in source route "batch-static"',
        );
      });

      it("should allow nested batch routes with matching inherited params", () => {
        expect(() =>
          router.addRoute([
            {
              name: "batch-a",
              path: "/batch-a/:sharedId",
              children: [{ name: "target", path: "/target" }],
            },
            {
              name: "batch-b",
              path: "/batch-b/:sharedId",
              children: [
                {
                  name: "source",
                  path: "/source",
                  forwardTo: "batch-a.target",
                },
              ],
            },
          ]),
        ).not.toThrowError();

        expect(getConfig(router).forwardMap["batch-b.source"]).toBe(
          "batch-a.target",
        );
      });
    });

    describe("matchPath integration with forwardTo", () => {
      it("should work with forwardTo property", () => {
        router.addRoute({ name: "fwdto-dest", path: "/fwdto-dest/:id" });
        router.addRoute({
          name: "fwdto-alias",
          path: "/fwdto-alias/:id",
          forwardTo: "fwdto-dest",
        });

        const state = router.matchPath("/fwdto-alias/123");

        expect(state?.name).toBe("fwdto-dest");
        expect(state?.params.id).toBe("123");
      });
    });
  });
});
