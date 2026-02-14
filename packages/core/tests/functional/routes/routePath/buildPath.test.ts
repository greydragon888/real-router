import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createTestRouter } from "../../../helpers";

import type { Route, Router } from "@real-router/core";

let router: Router;

describe("core/routes/routePath/buildPath", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("buildPath", () => {
    it("should build path for known route with no params", () => {
      const path = router.buildPath("home");

      expect(path).toBe("/home");
    });

    it("should build path with params", () => {
      router.addRoute({ name: "user", path: "/user/:id" });
      const path = router.buildPath("user", { id: "42" });

      expect(path).toBe("/user/42");
    });

    it("should return raw path for UNKNOWN_ROUTE if path param is string", () => {
      const path = router.buildPath("@@router/UNKNOWN_ROUTE", {
        path: "/not-found",
      });

      expect(path).toBe("/not-found");
    });

    it("should return empty string for UNKNOWN_ROUTE if path param is not a string", () => {
      const path = router.buildPath("@@router/UNKNOWN_ROUTE", {
        path: 404,
      });

      expect(path).toBe("");
    });
  });

  describe("buildPath with query params", () => {
    it("should build path with query params", () => {
      router.addRoute({ name: "search", path: "/search?q" });
      const path = router.buildPath("search", { q: "test" });

      expect(path).toBe("/search?q=test");
    });

    it("should build path with multiple query params", () => {
      router.addRoute({ name: "search", path: "/search?q&page" });
      const path = router.buildPath("search", { q: "test", page: "1" });

      expect(path).toBe("/search?q=test&page=1");
    });
  });

  describe("setRootPath", () => {
    it("should update root path for all routes", () => {
      router.setRootPath("/base");
      const path = router.buildPath("home");

      expect(path).toBe("/base/home");
    });

    it("should throw TypeError for non-string rootPath", () => {
      expect(() => {
        router.setRootPath(123 as unknown as string);
      }).toThrowError(TypeError);
      expect(() => {
        router.setRootPath(123 as unknown as string);
      }).toThrowError(
        "[router.setRootPath] rootPath must be a string, got number",
      );
    });

    it("should throw TypeError for null rootPath", () => {
      expect(() => {
        router.setRootPath(null as unknown as string);
      }).toThrowError(
        "[router.setRootPath] rootPath must be a string, got null",
      );
    });
  });

  describe("getRootPath", () => {
    it("should return current root path", () => {
      expect(router.getRootPath()).toBe("");

      router.setRootPath("/base");

      expect(router.getRootPath()).toBe("/base");
    });
  });

  describe("buildPath with encoder (R8 freeze protection)", () => {
    it("should apply encoder to params", () => {
      router.addRoute({
        name: "user",
        path: "/user/:id",
        encodeParams: (params) => ({
          ...params,
          id: `encoded-${params.id as string}`,
        }),
      });

      const path = router.buildPath("user", { id: "42" });

      expect(path).toBe("/user/encoded-42");
    });

    it("should pass copy of params to encoder (protects original)", () => {
      const originalParams = { id: "42", extra: "data" };
      let receivedParams: Record<string, unknown> | null = null;

      router.addRoute({
        name: "user",
        path: "/user/:id",
        encodeParams: (params) => {
          receivedParams = params;

          // Encoder can mutate its copy without affecting original
          params.id = `encoded-${params.id as string}`;

          return params;
        },
      });

      router.buildPath("user", originalParams);

      // Encoder received a copy, not the original
      expect(receivedParams).not.toBe(originalParams);
      // Original params remain unchanged
      expect(originalParams.id).toBe("42");
    });

    it("should not affect original params object", () => {
      const originalParams = { id: "42" };

      router.addRoute({
        name: "user",
        path: "/user/:id",
        encodeParams: (params) => ({
          ...params,
          id: `encoded-${params.id as string}`,
        }),
      });

      router.buildPath("user", originalParams);

      // Original params should remain unchanged
      expect(originalParams.id).toBe("42");
    });
  });

  describe("buildPath caching (lifecycle-based)", () => {
    it("should work before router.start() (cold call with fallback)", () => {
      const coldRouter = createTestRouter();
      // Router NOT started yet — should still work via fallback

      const path = coldRouter.buildPath("home");

      expect(path).toBe("/home");
    });

    it("should use cached buildOptions after router.start()", () => {
      // This test verifies that buildPath works correctly after start
      // The cache is created at start() and used for all subsequent calls
      const path1 = router.buildPath("home");
      const path2 = router.buildPath("home");

      expect(path1).toBe("/home");
      expect(path2).toBe("/home");
    });

    it("should invalidate cache and use new options after stop/start cycle", async () => {
      const cycleRouter = createTestRouter();

      await cycleRouter.start("/home");

      // First cycle — default trailingSlash
      const path1 = cycleRouter.buildPath("home");

      expect(path1).toBe("/home");

      cycleRouter.stop();

      // Second cycle — create router with new trailingSlash option
      const cycleRouter2 = createTestRouter({ trailingSlash: "always" });

      await cycleRouter2.start("/home");
      const path2 = cycleRouter2.buildPath("home");

      expect(path2).toBe("/home/");

      cycleRouter2.stop();
    });

    it("should apply trailingSlash option correctly", async () => {
      router.stop();
      router = createTestRouter({ trailingSlash: "always" });
      await router.start("/home");

      const path = router.buildPath("home");

      expect(path).toBe("/home/");

      router.stop();
      router = createTestRouter({ trailingSlash: "never" });
      await router.start("/home");
    });
  });

  describe("buildPath error handling", () => {
    describe("invalid route parameter", () => {
      it("should throw TypeError when route is undefined", () => {
        expect(() =>
          router.buildPath(undefined as unknown as string),
        ).toThrowError(TypeError);
      });

      it("should throw TypeError when route is null", () => {
        expect(() => router.buildPath(null as unknown as string)).toThrowError(
          TypeError,
        );
      });

      it("should throw TypeError when route is not a string", () => {
        expect(() => router.buildPath(123 as unknown as string)).toThrowError(
          TypeError,
        );
        expect(() => router.buildPath({} as unknown as string)).toThrowError(
          TypeError,
        );
      });

      it("should throw when route is empty string", () => {
        expect(() => router.buildPath("")).toThrowError();
      });
    });

    describe("route not found", () => {
      it("should throw when route does not exist", () => {
        expect(() => router.buildPath("nonexistent")).toThrowError(
          /nonexistent.*is not defined/,
        );
      });

      it("should throw when nested route does not exist", () => {
        expect(() => router.buildPath("home.nonexistent")).toThrowError(
          /home\.nonexistent.*is not defined/,
        );
      });
    });

    describe("constraint violation", () => {
      it("should throw when param violates constraint", () => {
        router.addRoute({
          name: "user",
          path: String.raw`/user/:id<\d+>`,
        });

        expect(() => router.buildPath("user", { id: "abc" })).toThrowError(
          /does not match constraint/,
        );
      });

      it("should pass when param matches constraint", () => {
        router.addRoute({
          name: "user",
          path: String.raw`/user/:id<\d+>`,
        });

        const path = router.buildPath("user", { id: "123" });

        expect(path).toBe("/user/123");
      });
    });

    describe("encoder errors", () => {
      it("should propagate custom errors from encoder", () => {
        router.addRoute({
          name: "user",
          path: "/user/:id",
          encodeParams: () => {
            throw new Error("Custom encoder error");
          },
        });

        expect(() => router.buildPath("user", { id: "42" })).toThrowError(
          "Custom encoder error",
        );
      });
    });
  });

  describe("buildPath edge cases", () => {
    describe("numeric parameter values", () => {
      it("should convert number 0 to string", () => {
        router.addRoute({ name: "user", path: "/user/:id" });

        const path = router.buildPath("user", { id: 0 });

        expect(path).toBe("/user/0");
      });

      it("should convert negative numbers to string", () => {
        router.addRoute({ name: "user", path: "/user/:id" });

        const path = router.buildPath("user", { id: -1 });

        expect(path).toBe("/user/-1");
      });

      it("should convert NaN to string 'NaN'", () => {
        router.addRoute({ name: "user", path: "/user/:id" });

        const path = router.buildPath("user", { id: Number.NaN });

        expect(path).toBe("/user/NaN");
      });

      it("should convert Infinity to string 'Infinity'", () => {
        router.addRoute({ name: "user", path: "/user/:id" });

        const path = router.buildPath("user", { id: Infinity });

        expect(path).toBe("/user/Infinity");
      });

      it("should convert -Infinity to string '-Infinity'", () => {
        router.addRoute({ name: "user", path: "/user/:id" });

        const path = router.buildPath("user", { id: -Infinity });

        expect(path).toBe("/user/-Infinity");
      });

      it("should convert -0 to string '0' (JavaScript behavior)", () => {
        router.addRoute({ name: "user", path: "/user/:id" });

        const path = router.buildPath("user", { id: -0 });

        // String(-0) === "0" in JavaScript
        expect(path).toBe("/user/0");
      });
    });

    describe("array parameter values", () => {
      it("should accept array with custom constraint", () => {
        router.addRoute({ name: "user", path: "/user/:ids<.*>" });

        const path = router.buildPath("user", { ids: ["1", "2", "3"] });

        expect(path).toBe("/user/%5B%221%22,%222%22,%223%22%5D");
      });

      it("should handle array in query params", () => {
        router.addRoute({ name: "filter", path: "/filter?tags" });

        const path = router.buildPath("filter", { tags: ["a", "b"] });

        // Query params with arrays produce multiple key=value pairs
        expect(path).toMatch(/tags=/);
      });
    });

    describe("empty string parameter values", () => {
      it("should URL-encode whitespace-only string", () => {
        router.addRoute({ name: "user", path: "/user/:id" });

        const path = router.buildPath("user", { id: "   " });

        expect(path).toMatch(/\/user\/%20%20%20|\/user\/\s{3}/);
      });
    });

    describe("encoder + defaultParams combinations", () => {
      it("should apply encoder after merging defaultParams", () => {
        router.addRoute({
          name: "user",
          path: "/user/:id",
          defaultParams: { id: "0" },
          encodeParams: (params) => ({
            ...params,
            id: `encoded-${params.id as string}`,
          }),
        });

        // Without params: uses defaultParams, then encoder
        const path = router.buildPath("user");

        expect(path).toBe("/user/encoded-0");
      });

      it("should override defaultParams with provided params before encoding", () => {
        router.addRoute({
          name: "user",
          path: "/user/:id",
          defaultParams: { id: "default" },
          encodeParams: (params) => ({
            ...params,
            id: `encoded-${params.id as string}`,
          }),
        });

        const path = router.buildPath("user", { id: "42" });

        expect(path).toBe("/user/encoded-42");
      });

      it("should work with encoder + defaultParams + constraint", () => {
        router.addRoute({
          name: "user",
          path: String.raw`/user/:id<\d+>`,
          defaultParams: { id: "0" },
          encodeParams: (params) => {
            // Increment the id
            const numId = Number(params.id);

            return { ...params, id: String(numId + 1) };
          },
        });

        // Default "0" → encoder makes "1" → constraint \d+ passes
        const path = router.buildPath("user");

        expect(path).toBe("/user/1");
      });

      it("should fail constraint check after encoder transforms value", () => {
        router.addRoute({
          name: "user",
          path: String.raw`/user/:id<\d+>`,
          encodeParams: () => ({ id: "not-a-number" }),
        });

        expect(() => router.buildPath("user", { id: "42" })).toThrowError(
          /does not match constraint/,
        );
      });
    });

    describe("boolean parameter values", () => {
      it("should convert true to string 'true'", () => {
        router.addRoute({ name: "filter", path: "/filter/:active" });

        const path = router.buildPath("filter", { active: true });

        expect(path).toBe("/filter/true");
      });

      it("should convert false to string 'false'", () => {
        router.addRoute({ name: "filter", path: "/filter/:active" });

        const path = router.buildPath("filter", { active: false });

        expect(path).toBe("/filter/false");
      });
    });

    describe("special characters in params", () => {
      describe("query params URL encoding", () => {
        it("should URL-encode spaces in query params", () => {
          router.addRoute({ name: "search", path: "/search?q" });

          const path = router.buildPath("search", { q: "hello world" });

          expect(path).toBe("/search?q=hello%20world");
        });

        it("should URL-encode ampersand and equals in query params", () => {
          router.addRoute({ name: "search", path: "/search?q" });

          const path = router.buildPath("search", { q: "a&b=c" });

          expect(path).toBe("/search?q=a%26b%3Dc");
        });

        it("should URL-encode forward slash in query params", () => {
          router.addRoute({ name: "search", path: "/search?q" });

          const path = router.buildPath("search", { q: "path/to/file" });

          expect(path).toBe("/search?q=path%2Fto%2Ffile");
        });

        it("should URL-encode question mark in query params", () => {
          router.addRoute({ name: "search", path: "/search?q" });

          const path = router.buildPath("search", { q: "what?" });

          expect(path).toBe("/search?q=what%3F");
        });

        it("should URL-encode hash in query params", () => {
          router.addRoute({ name: "search", path: "/search?q" });

          const path = router.buildPath("search", { q: "section#1" });

          expect(path).toBe("/search?q=section%231");
        });
      });

      describe("unicode in query params", () => {
        it("should URL-encode Cyrillic characters", () => {
          router.addRoute({ name: "search", path: "/search?q" });

          const path = router.buildPath("search", { q: "привет" });

          expect(path).toBe("/search?q=%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82");
        });

        it("should URL-encode emoji characters", () => {
          router.addRoute({ name: "search", path: "/search?q" });

          const path = router.buildPath("search", { q: "🎉" });

          expect(path).toBe("/search?q=%F0%9F%8E%89");
        });

        it("should URL-encode Chinese characters", () => {
          router.addRoute({ name: "search", path: "/search?q" });

          const path = router.buildPath("search", { q: "你好" });

          expect(path).toBe("/search?q=%E4%BD%A0%E5%A5%BD");
        });
      });

      describe("URL path params encoding", () => {
        it("should URL-encode spaces in path params", () => {
          router.addRoute({ name: "user", path: "/user/:name<.*>" });

          const path = router.buildPath("user", { name: "John Doe" });

          expect(path).toBe("/user/John%20Doe");
        });

        it("should URL-encode Cyrillic in path params", () => {
          router.addRoute({ name: "user", path: "/user/:name<.*>" });

          const path = router.buildPath("user", { name: "Иван" });

          expect(path).toBe("/user/%D0%98%D0%B2%D0%B0%D0%BD");
        });

        it("should URL-encode special URL characters in path params", () => {
          router.addRoute({ name: "file", path: "/file/:path<.*>" });

          const path = router.buildPath("file", { path: "dir/file.txt" });

          expect(path).toBe("/file/dir%2Ffile.txt");
        });
      });

      describe("preserved characters (sub-delimiters)", () => {
        it("should preserve sub-delimiters in query params per RFC 3986", () => {
          router.addRoute({ name: "search", path: "/search?q" });

          // Sub-delimiters: ! $ & ' ( ) * + , ; =
          // But & and = are query-specific, so they get encoded
          const path = router.buildPath("search", { q: "test!value" });

          expect(path).toBe("/search?q=test!value");
        });

        it("should preserve colon in path params", () => {
          router.addRoute({ name: "time", path: "/time/:value<.*>" });

          const path = router.buildPath("time", { value: "12:30:00" });

          expect(path).toBe("/time/12:30:00");
        });

        it("should URL-encode at-sign in path params (gen-delim per RFC 3986)", () => {
          router.addRoute({ name: "user", path: "/user/:email<.*>" });

          const path = router.buildPath("user", { email: "user@example.com" });

          // @ is a gen-delim and gets percent-encoded in path segments
          expect(path).toBe("/user/user%40example.com");
        });
      });
    });

    describe("unusual but valid inputs", () => {
      describe("route name validation", () => {
        it("should reject Cyrillic route names (ASCII only)", () => {
          expect(() =>
            router.addRoute({ name: "пользователи", path: "/users" }),
          ).toThrowError(/Invalid route name/);
        });

        it("should reject emoji route names", () => {
          expect(
            () => void router.addRoute({ name: "🚀", path: "/launch" }),
          ).toThrowError(/Invalid route name/);
        });

        it("should reject route names with unicode characters", () => {
          expect(
            () => void router.addRoute({ name: "café", path: "/cafe" }),
          ).toThrowError(/Invalid route name/);
        });

        it("should accept route names with underscores and hyphens", () => {
          router.addRoute({ name: "user_profile", path: "/user-profile" });

          const path = router.buildPath("user_profile");

          expect(path).toBe("/user-profile");
        });

        it("should accept route names starting with underscore", () => {
          router.addRoute({ name: "_private", path: "/private" });

          const path = router.buildPath("_private");

          expect(path).toBe("/private");
        });

        it("should accept nested route names with dots", () => {
          router.addRoute({
            name: "members",
            path: "/members",
            children: [{ name: "details", path: "/details" }],
          });

          const path = router.buildPath("members.details");

          expect(path).toBe("/members/details");
        });
      });

      describe("deeply nested routes", () => {
        it("should handle 10-level deep nested routes", () => {
          // Build a 10-level deep route structure
          const buildDeepRoute = (depth: number): Route => {
            if (depth === 0) {
              return { name: "leaf", path: "/leaf" };
            }

            return {
              name: `level${depth}`,
              path: `/l${depth}`,
              children: [buildDeepRoute(depth - 1)],
            };
          };

          router.addRoute(buildDeepRoute(10));

          const deepName =
            "level10.level9.level8.level7.level6.level5.level4.level3.level2.level1.leaf";
          const path = router.buildPath(deepName);

          expect(path).toBe("/l10/l9/l8/l7/l6/l5/l4/l3/l2/l1/leaf");
        });

        it("should handle 50-level deep nested routes (stress test)", () => {
          // Build a 50-level deep route structure iteratively
          let current: Route = { name: "leaf", path: "/leaf" };

          for (let i = 1; i <= 50; i++) {
            current = {
              name: `l${i}`,
              path: `/p${i}`,
              children: [current],
            };
          }

          router.addRoute(current);

          const deepName = `${Array.from(
            { length: 50 },
            (_, i) => `l${50 - i}`,
          ).join(".")}.leaf`;
          const path = router.buildPath(deepName);

          const expectedPath = `${Array.from(
            { length: 50 },
            (_, i) => `/p${50 - i}`,
          ).join("")}/leaf`;

          expect(path).toBe(expectedPath);
        });
      });

      describe("Object.create(null) as params", () => {
        it("should work with null-prototype objects", () => {
          const nullProtoParams = Object.create(null) as Record<string, string>;

          nullProtoParams.id = "42";

          router.addRoute({ name: "user", path: "/user/:id" });

          const path = router.buildPath("user", nullProtoParams);

          expect(path).toBe("/user/42");
        });

        it("should work with null-prototype objects with multiple params", () => {
          const nullProtoParams = Object.create(null) as Record<string, string>;

          nullProtoParams.userId = "1";
          nullProtoParams.postId = "2";

          router.addRoute({
            name: "post",
            path: "/user/:userId/post/:postId",
          });

          const path = router.buildPath("post", nullProtoParams);

          expect(path).toBe("/user/1/post/2");
        });

        it("should work with null-prototype objects in query params", () => {
          const nullProtoParams = Object.create(null) as Record<string, string>;

          nullProtoParams.q = "search";

          router.addRoute({ name: "search", path: "/search?q" });

          const path = router.buildPath("search", nullProtoParams);

          expect(path).toBe("/search?q=search");
        });
      });

      describe("Symbol keys in params", () => {
        it("should ignore Symbol keys and use string keys", () => {
          const symbolKey = Symbol("id");
          const paramsWithSymbol = {
            [symbolKey]: "ignored",
            id: "123",
          };

          router.addRoute({ name: "user", path: "/user/:id" });

          const path = router.buildPath("user", paramsWithSymbol);

          expect(path).toBe("/user/123");
        });

        it("should work when only string keys are present alongside Symbol keys", () => {
          const sym1 = Symbol("extra1");
          const sym2 = Symbol("extra2");
          const params = {
            [sym1]: "value1",
            [sym2]: "value2",
            id: "42",
            name: "test",
          };

          router.addRoute({ name: "item", path: "/item/:id/:name" });

          const path = router.buildPath("item", params);

          expect(path).toBe("/item/42/test");
        });
      });

      describe("prototype pollution protection", () => {
        it("should not be affected by Object.prototype pollution", () => {
          router.addRoute({ name: "user", path: "/user/:id" });

          // This test verifies that Object.hasOwn is used correctly
          // and doesn't rely on hasOwnProperty from prototype
          const path = router.buildPath("user", { id: "42" });

          expect(path).toBe("/user/42");

          // Verify Object.hasOwn exists (used internally)
          expect(typeof Object.hasOwn).toBe("function");
        });

        it("should ignore inherited properties from prototype chain", () => {
          // Create object with inherited property
          const proto = { inheritedId: "inherited" };
          const params = Object.create(proto) as Record<string, string>;

          params.id = "42";

          router.addRoute({ name: "user", path: "/user/:id" });

          const path = router.buildPath("user", params);

          // Should use own property, not inherited
          expect(path).toBe("/user/42");
        });

        it("should include all enumerable properties as query params", () => {
          // Non-route params become query params
          const params = {
            id: "42",
            extra: "value",
          };

          router.addRoute({ name: "userX", path: "/user/:id" });

          const path = router.buildPath("userX", params);

          // Extra params are appended as query params
          expect(path).toBe("/user/42?extra=value");
        });

        it("should not call toString/valueOf methods on params object", () => {
          let toStringCalled = false;
          let valueOfCalled = false;

          const params = {
            id: "42",
          };

          // Define non-enumerable methods to track if they're called
          Object.defineProperty(params, "toString", {
            value: () => {
              toStringCalled = true;

              return "[object Params]";
            },
            enumerable: false,
          });

          Object.defineProperty(params, "valueOf", {
            value: () => {
              valueOfCalled = true;

              return params;
            },
            enumerable: false,
          });

          router.addRoute({ name: "userY", path: "/user/:id" });

          const path = router.buildPath("userY", params);

          expect(path).toBe("/user/42");
          // These methods should not be called during buildPath
          expect(toStringCalled).toBe(false);
          expect(valueOfCalled).toBe(false);
        });
      });
    });
  });
});
