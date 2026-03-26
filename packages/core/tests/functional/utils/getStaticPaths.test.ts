import { describe, it, expect } from "vitest";

import { createRouter } from "../../../src";
import { getStaticPaths } from "../../../src/utils/getStaticPaths";

function makeRouter(routes: Parameters<typeof createRouter>[0]) {
  return createRouter(routes, { allowNotFound: true });
}

describe("getStaticPaths", () => {
  it("should return paths for static leaf routes", async () => {
    const router = makeRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ]);

    const paths = await getStaticPaths(router);

    expect(paths).toStrictEqual(["/", "/about"]);

    router.dispose();
  });

  it("should return paths for nested leaf routes only", async () => {
    const router = makeRouter([
      { name: "home", path: "/" },
      {
        name: "users",
        path: "/users",
        children: [
          { name: "list", path: "/" },
          { name: "profile", path: "/:id" },
        ],
      },
    ]);

    const paths = await getStaticPaths(router, {
      "users.profile": async () => [{ id: "1" }],
    });

    expect(paths).toStrictEqual(["/", "/users", "/users/1"]);

    router.dispose();
  });

  it("should expand dynamic routes via entries", async () => {
    const router = makeRouter([{ name: "posts", path: "/posts/:slug" }]);

    const paths = await getStaticPaths(router, {
      posts: async () => [{ slug: "hello" }, { slug: "world" }],
    });

    expect(paths).toStrictEqual(["/posts/hello", "/posts/world"]);

    router.dispose();
  });

  it("should return empty array for router with no routes", async () => {
    const router = makeRouter([]);

    const paths = await getStaticPaths(router);

    expect(paths).toStrictEqual([]);

    router.dispose();
  });

  it("should handle entries returning empty array", async () => {
    const router = makeRouter([{ name: "posts", path: "/posts/:slug" }]);

    const paths = await getStaticPaths(router, {
      posts: async () => [],
    });

    expect(paths).toStrictEqual([]);

    router.dispose();
  });

  it("should work without entries parameter", async () => {
    const router = makeRouter([{ name: "home", path: "/" }]);

    const paths = await getStaticPaths(router);

    expect(paths).toStrictEqual(["/"]);

    router.dispose();
  });

  it("should skip parent routes and only include leaves", async () => {
    const router = makeRouter([
      {
        name: "a",
        path: "/a",
        children: [
          {
            name: "b",
            path: "/b",
            children: [{ name: "c", path: "/c" }],
          },
        ],
      },
    ]);

    const paths = await getStaticPaths(router);

    expect(paths).toStrictEqual(["/a/b/c"]);

    router.dispose();
  });

  it("should handle mixed static and dynamic routes", async () => {
    const router = makeRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
      { name: "blog", path: "/blog/:slug" },
    ]);

    const paths = await getStaticPaths(router, {
      blog: async () => [{ slug: "first" }, { slug: "second" }],
    });

    expect(paths).toStrictEqual(["/", "/about", "/blog/first", "/blog/second"]);

    router.dispose();
  });

  it("should ignore entries for non-existent routes", async () => {
    const router = makeRouter([{ name: "home", path: "/" }]);

    const paths = await getStaticPaths(router, {
      nonexistent: async () => [{ id: "1" }],
    });

    expect(paths).toStrictEqual(["/"]);

    router.dispose();
  });
});
