import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { createRouteNodeSource } from "../../src";

import type { Params, Router, SearchParams } from "@real-router/core";

// A name the root declares belongs to no segment (#2895, decided), and the
// source decides through `router.shouldUpdateNode`: a node between the root
// and the route is not told when only such a name changes, so its snapshot
// keeps the route it last saw.
describe("createRouteNodeSource — a name the root declares (#2895)", () => {
  let router: Router | undefined;

  afterEach(() => {
    router?.dispose();
    router = undefined;
  });

  async function usersNodeAcross(
    rootPath: string,
    from: string,
    params: Params,
    search?: SearchParams,
  ): Promise<{ emits: number; path: string | undefined }> {
    const instance = createRouter([
      {
        name: "users",
        path: "/users/:uid",
        children: [{ name: "view", path: "/view" }],
      },
    ]);

    getPluginApi(instance).setRootPath(rootPath);
    router = instance;
    await instance.start(from);

    const source = createRouteNodeSource(instance, "users");
    let emits = 0;
    const unsubscribe = source.subscribe(() => {
      emits++;
    });

    await instance.navigate("users.view", params, search);

    const path = source.getSnapshot().route?.path;

    unsubscribe();

    return { emits, path };
  }

  it("does not emit for a parent when only a root path slot changes", async () => {
    await expect(
      usersNodeAcross("/app/:tenant", "/app/a/users/1/view", {
        tenant: "b",
        uid: "1",
      }),
    ).resolves.toStrictEqual({ emits: 0, path: "/app/a/users/1/view" });
  });

  it("does not emit for a parent when only a root ?query name changes", async () => {
    await expect(
      usersNodeAcross(
        "?lang",
        "/users/1/view?lang=en",
        { uid: "1" },
        { lang: "fr" },
      ),
    ).resolves.toStrictEqual({ emits: 0, path: "/users/1/view?lang=en" });
  });

  it("emits for the parent when its own slot changes (control)", async () => {
    await expect(
      usersNodeAcross("/app/:tenant", "/app/a/users/1/view", {
        tenant: "a",
        uid: "2",
      }),
    ).resolves.toStrictEqual({ emits: 1, path: "/app/a/users/2/view" });
  });
});
