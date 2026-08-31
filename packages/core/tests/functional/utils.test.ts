import { describe, afterEach, beforeEach, it, expect, beforeAll } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { createTestRouter, pickRouteIdentity } from "../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("core/utils", () => {
  afterEach(() => {
    router.stop();
  });

  describe("with strictQueryParams", () => {
    beforeEach(() => {
      router = createTestRouter();
    });

    it("should expose RouteNode path building function", () => {
      expect(router.buildPath("users.list")).toStrictEqual("/users/list");
    });

    it("should tell if a route is active or not", async () => {
      await router.start("/home");

      await router.navigate("users.view", { id: 1 });

      expect(router.isActiveRoute("users.view", { id: 1 })).toStrictEqual(true);
      expect(router.isActiveRoute("users.view", { id: 2 })).toStrictEqual(
        false,
      );
      expect(router.isActiveRoute("users.view")).toStrictEqual(false);
      expect(router.isActiveRoute("users")).toStrictEqual(true);
      expect(router.isActiveRoute("users", {}, undefined, true)).toStrictEqual(
        false,
      );

      await router.navigate("section.query", { section: "section1" });

      expect(
        router.isActiveRoute("section", { section: "section1" }),
      ).toStrictEqual(true);
      expect(
        router.isActiveRoute("section.query", {
          section: "section1",
          param1: "123",
        }),
      ).toStrictEqual(true);
      expect(
        router.isActiveRoute("section.query", { section: "section2" }),
      ).toStrictEqual(false);
      // #1978 — the retired single-bag spelling of a DECLARED query name.
      // `param2` in the PARAMS bag prints nothing of its own, and this route
      // declares no `defaultSearch` for that slot, so the link's href is
      // `/sections/section1/query` — byte for byte the current URL, asserted
      // below. A location predicate therefore answers `true`, under BOTH
      // polarities. Refusing the spelling is the always-on channel guard's
      // job, on the committing producers.
      //
      // ⚠ Not a general licence: with a `defaultSearch` for the same slot the
      // params-bag twin WITHHOLDS it, the href really does lose `?name=value`,
      // and the answer is `false` — pinned in
      // `tests/functional/routes/isActiveRoute.test.ts`.
      expect(
        router.buildPath("section.query", {
          section: "section1",
          param2: "123",
        }),
      ).toStrictEqual(router.getState()!.path);
      expect(
        router.isActiveRoute(
          "section.query",
          { section: "section1", param2: "123" },
          undefined,
          false,
          false,
        ),
      ).toStrictEqual(true);
      // …and the query channel still decides when it is actually used.
      expect(
        router.isActiveRoute(
          "section.query",
          { section: "section1" },
          { param1: "123" },
          false,
          false,
        ),
      ).toStrictEqual(false);
      expect(router.isActiveRoute("users.view", { id: 123 })).toStrictEqual(
        false,
      );
    });

    it("should decode path params on match", () => {
      expect(
        pickRouteIdentity(
          getPluginApi(router).matchPath<{ one: string; two: string }>(
            "/encoded/hello/123",
          ),
        ),
      ).toStrictEqual({
        name: "withEncoder",
        params: {
          one: "hello",
          two: "123",
        },
        path: "/encoded/hello/123",
      });
    });

    it("should match deep `/` routes", () => {
      router.stop();

      const neverRouter = createTestRouter({ trailingSlash: "never" });

      expect(
        pickRouteIdentity(getPluginApi(neverRouter).matchPath("/profile")),
      ).toStrictEqual({
        name: "profile.me",
        params: {},
        path: "/profile",
      });

      neverRouter.stop();

      const alwaysRouter = createTestRouter({ trailingSlash: "always" });

      expect(
        pickRouteIdentity(getPluginApi(alwaysRouter).matchPath("/profile")),
      ).toStrictEqual({
        name: "profile.me",
        params: {},
        path: "/profile/",
      });

      alwaysRouter.stop();
    });
  });

  describe("without strict query params mode", () => {
    beforeEach(async () => {
      router = createTestRouter({
        queryParamsMode: "loose",
      });
      await router.start("/home");
    });

    it("builds paths with extra parameters spelled in the query channel", () => {
      // Renamed at Phase 2 step 2-1: an undeclared key rides the QUERY channel
      // to reach the URL. Handed in the path bag it is app-level data and is not
      // printed — the same URL `navigate` commits for that intent.
      expect(
        router.buildPath("users.view", { id: "123" }, { username: "thomas" }),
      ).toStrictEqual("/users/view/123?username=thomas");

      expect(
        router.buildPath("users.view", { id: "123", username: "thomas" }),
      ).toStrictEqual("/users/view/123");
    });
  });

  describe("with non default query params format", () => {
    beforeAll(() => {
      router = createRouter(
        [
          {
            name: "query",
            path: "/query?param1&param2",
          },
        ],
        {
          queryParamsMode: "loose",
          queryParams: {
            booleanFormat: "auto",
          },
        },
      );
    });

    it("should build paths", () => {
      expect(
        router.buildPath(
          "query",
          {},
          {
            param1: true,
            param2: false,
          },
        ),
      ).toStrictEqual("/query?param1=true&param2=false");
    });

    it("should match paths", async () => {
      try {
        await router.start("");
      } catch {
        // Expected error
      }

      expect(
        router.buildPath("query", {}, { param1: true, param2: false }),
      ).toStrictEqual("/query?param1=true&param2=false");

      const match = getPluginApi(router).matchPath<{
        param1: boolean;
        param: boolean;
      }>("/query?param1=true&param2=false");

      expect(match?.search).toStrictEqual({
        param1: true,
        param2: false,
      });

      router.stop();
    });

    it("should match on start", async () => {
      await router.start("/query?param1=true&param2=false");

      expect(router.getState()?.search).toStrictEqual({
        param1: true,
        param2: false,
      });
    });
  });

  it("should build path with default parameters", () => {
    const router = createRouter([
      {
        name: "withDefaults",
        defaultParams: { id: "1" },
        path: "/with-defaults/:id",
      },
    ]);

    expect(router.buildPath("withDefaults")).toStrictEqual("/with-defaults/1");
    expect(getPluginApi(router).makeState("withDefaults").params).toStrictEqual(
      { id: "1" },
    );
  });
});
