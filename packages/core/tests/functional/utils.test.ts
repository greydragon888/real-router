import { describe, afterEach, beforeEach, it, expect, beforeAll } from "vitest";

import { createRouter } from "@real-router/core";

import { createTestRouter, omitMeta } from "../helpers";

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
      expect(router.isActiveRoute("users", {}, true)).toStrictEqual(false);

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
      expect(
        router.isActiveRoute(
          "section.query",
          { section: "section1", param2: "123" },
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
        omitMeta(
          router.matchPath<{ one: string; two: string }>("/encoded/hello/123"),
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

      expect(omitMeta(neverRouter.matchPath("/profile"))).toStrictEqual({
        name: "profile.me",
        params: {},
        path: "/profile",
      });

      neverRouter.stop();

      const alwaysRouter = createTestRouter({ trailingSlash: "always" });

      expect(omitMeta(alwaysRouter.matchPath("/profile"))).toStrictEqual({
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

    it("should build paths with extra parameters", () => {
      expect(
        router.buildPath("users.view", {
          id: "123",
          username: "thomas",
        }),
      ).toStrictEqual("/users/view/123?username=thomas");
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
            booleanFormat: "string",
          },
        },
      );
    });

    it("should build paths", () => {
      expect(
        router.buildPath("query", {
          param1: true,
          param2: false,
        }),
      ).toStrictEqual("/query?param1=true&param2=false");
    });

    it("should match paths", async () => {
      try {
        await router.start("");
      } catch {
        // Expected error
      }

      expect(
        router.buildPath("query", { param1: true, param2: false }),
      ).toStrictEqual("/query?param1=true&param2=false");

      const match = router.matchPath<{ param1: boolean; param: boolean }>(
        "/query?param1=true&param2=false",
      );

      expect(match?.params).toStrictEqual({
        param1: true,
        param2: false,
      });

      router.stop();
    });

    it("should match on start", async () => {
      await router.start("/query?param1=true&param2=false");

      expect(router.getState()?.params).toStrictEqual({
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
    expect(router.makeState("withDefaults").params).toStrictEqual({ id: "1" });
  });
});
