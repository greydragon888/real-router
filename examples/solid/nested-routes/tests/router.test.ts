import { createRouter } from "@real-router/core";
import { routes } from "../src/routes";

import type { Router } from "@real-router/core";

let router: Router;

afterEach(() => {
  router.stop();
});

describe("Nested route navigation", () => {
  it("navigates to users.list child route", async () => {
    router = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await router.start("/");

    const state = await router.navigate("users.list");

    expect(state.name).toBe("users.list");
    expect(state.path).toBe("/users/list");
  });

  it("navigates to users.profile with params", async () => {
    router = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await router.start("/");

    const state = await router.navigate("users.profile", { id: "2" });

    expect(state.name).toBe("users.profile");
    expect(state.params).toEqual({ id: "2" });
    expect(state.path).toBe("/users/2");
  });

  it("navigates to users.settings", async () => {
    router = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await router.start("/");

    const state = await router.navigate("users.settings");

    expect(state.name).toBe("users.settings");
    expect(state.path).toBe("/users/settings");
  });
});

describe("forwardTo on parent", () => {
  it("/users redirects to /users/list via forwardTo", async () => {
    router = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await router.start("/users");

    expect(router.getState()?.name).toBe("users.list");
    expect(router.getState()?.path).toBe("/users/list");
  });
});
