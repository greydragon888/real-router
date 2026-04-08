/**
 * Tests for absolute paths.
 */

import { describe, it, expect } from "vitest";

import { matchPath } from "./helpers";
import { createRouteTree } from "../../../src/builder/createRouteTree";

describe("New API - absolute paths", () => {
  it("should match absolute paths", () => {
    const tree = createRouteTree("", "", [
      {
        name: "parent",
        path: "/parent",
        children: [{ name: "absolute", path: "~/absolute" }],
      },
    ]);

    const result = matchPath(tree, "/absolute");

    expect(result?.name).toBe("parent.absolute");
  });

  it("should compute staticPath for child of absolute route", () => {
    const tree = createRouteTree("", "", [
      {
        name: "admin",
        path: "/admin",
        children: [
          {
            name: "dashboard",
            path: "~/dashboard",
            children: [{ name: "stats", path: "/stats" }],
          },
        ],
      },
    ]);

    // Child of an absolute route should have correct staticPath
    const result = matchPath(tree, "/dashboard/stats");

    expect(result?.name).toBe("admin.dashboard.stats");
  });

  it("should match absolute path with route params", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [{ name: "profile", path: "~/profile/:id" }],
      },
    ]);

    const result = matchPath(tree, "/profile/42");

    expect(result?.name).toBe("users.profile");
    expect(result?.params).toStrictEqual({ id: "42" });
  });

  it("should match multiple absolute children under same parent", () => {
    const tree = createRouteTree("", "", [
      {
        name: "app",
        path: "/app",
        children: [
          { name: "login", path: "~/login" },
          { name: "register", path: "~/register" },
          { name: "reset", path: "~/reset-password" },
        ],
      },
    ]);

    const loginResult = matchPath(tree, "/login");
    const registerResult = matchPath(tree, "/register");
    const resetResult = matchPath(tree, "/reset-password");

    expect(loginResult?.name).toBe("app.login");
    expect(registerResult?.name).toBe("app.register");
    expect(resetResult?.name).toBe("app.reset");
  });

  it("should match deeply nested absolute path (3 levels)", () => {
    const tree = createRouteTree("", "", [
      {
        name: "org",
        path: "/org",
        children: [
          {
            name: "team",
            path: "~/team",
            children: [
              {
                name: "member",
                path: "~/member",
                children: [{ name: "details", path: "/details" }],
              },
            ],
          },
        ],
      },
    ]);

    const teamResult = matchPath(tree, "/team");
    const memberResult = matchPath(tree, "/member");
    const detailsResult = matchPath(tree, "/member/details");

    expect(teamResult?.name).toBe("org.team");
    expect(memberResult?.name).toBe("org.team.member");
    expect(detailsResult?.name).toBe("org.team.member.details");
  });
});
