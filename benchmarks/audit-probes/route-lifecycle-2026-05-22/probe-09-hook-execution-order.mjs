// Probe-09: Hook Execution Order. CLAUDE.md gotcha says:
//   For users.profile → admin.dashboard:
//   1. deactivate guard 'users.profile' (innermost first)
//   2. deactivate guard 'users'
//   3. activate guard 'admin' (outermost first)
//   4. activate guard 'admin.dashboard' (innermost last)
//
// Verify via call-order recording from a multi-level transition with guards
// at every depth.

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

const router = createRouter([
  {
    name: "users",
    path: "/users",
    children: [
      {
        name: "profile",
        path: "/profile",
      },
    ],
  },
  {
    name: "admin",
    path: "/admin",
    children: [
      {
        name: "dashboard",
        path: "/dashboard",
      },
    ],
  },
]);
await router.start("/");

const lifecycle = getLifecycleApi(router);
const order = [];

for (const name of ["users", "users.profile", "admin", "admin.dashboard"]) {
  lifecycle.addDeactivateGuard(name, () => () => {
    order.push(`deactivate:${name}`);
    return true;
  });
  lifecycle.addActivateGuard(name, () => () => {
    order.push(`activate:${name}`);
    return true;
  });
}

await router.navigate("users.profile");
order.length = 0; // reset for the actual transition we care about

await router.navigate("admin.dashboard");

console.log("[Probe-09] Hook execution order for users.profile → admin.dashboard:");
for (const entry of order) {
  console.log("  ", entry);
}

const expected = [
  "deactivate:users.profile",
  "deactivate:users",
  "activate:admin",
  "activate:admin.dashboard",
];
const matches = JSON.stringify(order) === JSON.stringify(expected);

console.log("\n[Probe-09] Matches CLAUDE.md gotcha:", matches);
if (matches) {
  console.log("→ VERIFIED: deactivate innermost-first, activate outermost-first.");
  process.exitCode = 0;
} else {
  console.log("→ DRIFT: hook order does not match documented contract.");
  console.log("  Expected:", expected);
  process.exitCode = 1;
}
