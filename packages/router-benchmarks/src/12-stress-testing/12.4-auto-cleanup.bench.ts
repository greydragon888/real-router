// packages/router-benchmarks/modules/12-stress-testing/12.4-auto-cleanup.bench.ts

import { bench } from "mitata";

import { createNestedRouter, IS_ROUTER5 } from "../helpers";

import type { Route } from "../helpers";

// 12.4.1 Navigation with auto-cleanup of 10 canDeactivate guards
{
  const router = createNestedRouter();

  for (let i = 0; i < 10; i++) {
    router.addDeactivateGuard("admin.users.list", () => () => true);
  }

  router.start("/");

  bench(
    "12.4.1 Navigation with auto-cleanup of 10 canDeactivate guards",
    () => {
      router.navigate("admin.users.list");
      router.navigate("home"); // Should trigger cleanup
    },
  ).gc("inner");
}

// 12.4.2 Navigation with auto-cleanup of 50 guards
{
  const router = createNestedRouter();

  for (let i = 0; i < 50; i++) {
    router.addDeactivateGuard("admin.users.list", () => () => true);
    router.addDeactivateGuard("admin.users", () => () => true);
  }

  router.start("/");

  bench("12.4.2 Navigation with auto-cleanup of 50 guards", () => {
    router.navigate("admin.users.list");
    router.navigate("home"); // Should trigger cleanup
  }).gc("inner");
}

// 12.4.3 Thousand navigations with constant auto-cleanup
{
  const router = createNestedRouter();

  for (let i = 0; i < 5; i++) {
    router.addDeactivateGuard("admin.users.list", () => () => true);
    router.addDeactivateGuard("admin.users.profile", () => () => true);
  }

  router.start("/");

  bench("12.4.3 Thousand navigations with constant auto-cleanup", () => {
    for (let i = 0; i < 1000; i++) {
      router.navigate(i % 2 === 0 ? "admin.users.list" : "admin.users.profile");
    }
  }).gc("inner");
}

// 12.4.4 Comparison: navigation with/without auto-cleanup
{
  const router = createNestedRouter();

  router.start("/");

  bench(
    "12.4.4 Comparison: navigation with/without auto-cleanup (without cleanup)",
    () => {
      router.navigate("admin.users.list");
      router.navigate("admin.users.profile");
    },
  ).gc("inner");
}

{
  const router = createNestedRouter();

  for (let i = 0; i < 10; i++) {
    router.addDeactivateGuard("admin.users.list", () => () => true);
  }

  router.start("/");

  bench(
    "12.4.4 Comparison: navigation with/without auto-cleanup (with cleanup)",
    () => {
      router.navigate("admin.users.list");
      router.navigate("home"); // Triggers cleanup
    },
  ).gc("inner");
}

// 12.4.5 Auto-cleanup with deep 7-level hierarchy
if (IS_ROUTER5) {
  const router = createNestedRouter();

  // Add deep guards for nested router
  router.addDeactivateGuard("root.level1.level2", () => () => true);

  // Build deep route structure to avoid TypeScript recursion limits
  const deepRoute: Route = {
    name: "deep",
    path: "/deep",
    children: [
      {
        name: "l1",
        path: "/l1",
        children: [
          {
            name: "l2",
            path: "/l2",
            children: [
              {
                name: "l3",
                path: "/l3",
                children: [
                  {
                    name: "l4",
                    path: "/l4",
                    children: [
                      {
                        name: "l5",
                        path: "/l5",
                        children: [{ name: "l6", path: "/l6" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  // @ts-expect-error - use method from router5
  router.add(deepRoute);
  router.addDeactivateGuard("deep.l1.l2.l3.l4.l5.l6", () => () => true);
  router.start("/");

  bench("12.4.5 Auto-cleanup with deep 7-level hierarchy", () => {
    router.navigate("deep.l1.l2.l3.l4.l5.l6");
    router.navigate("root"); // Cleanup deep guards
  }).gc("inner");
} else {
  const router = createNestedRouter();

  // Add deep guards for nested router
  router.addDeactivateGuard("root.level1.level2", () => () => true);

  // Build deep route structure to avoid TypeScript recursion limits
  const deepRoute: Route = {
    name: "deep",
    path: "/deep",
    children: [
      {
        name: "l1",
        path: "/l1",
        children: [
          {
            name: "l2",
            path: "/l2",
            children: [
              {
                name: "l3",
                path: "/l3",
                children: [
                  {
                    name: "l4",
                    path: "/l4",
                    children: [
                      {
                        name: "l5",
                        path: "/l5",
                        children: [{ name: "l6", path: "/l6" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  router.addRoute(deepRoute);
  router.addDeactivateGuard("deep.l1.l2.l3.l4.l5.l6", () => () => true);
  router.start("/");

  bench("12.4.5 Auto-cleanup with deep 7-level hierarchy", () => {
    router.navigate("deep.l1.l2.l3.l4.l5.l6");
    router.navigate("root"); // Cleanup deep guards
  }).gc("inner");
}
