import { can } from "../../../shared/abilities";
import { store } from "../../../shared/store";

import type { AppDependencies } from "./types";
import type { GuardFnFactory, Route } from "@real-router/core";

const adminGuard: GuardFnFactory<AppDependencies> = (_router, getDep) => () =>
  can(getDep("abilities"), "manage", "admin");

function settingsDeactivateGuardFn(): Promise<boolean> {
  const hasUnsaved =
    (store.get("settings:unsaved") as boolean | undefined) ?? false;

  if (!hasUnsaved) {
    return Promise.resolve(true);
  }

  return Promise.resolve(
    globalThis.confirm("You have unsaved changes. Leave anyway?"),
  );
}

const settingsDeactivateGuard: GuardFnFactory = () => settingsDeactivateGuardFn;

export const publicRoutes: Route[] = [
  { name: "home", path: "/" },
  { name: "services", path: "/services" },
  { name: "contacts", path: "/contacts" },
  { name: "login", path: "/login" },
];

export const privateRoutes: Route<AppDependencies>[] = [
  { name: "home", path: "/", forwardTo: "dashboard" },
  { name: "dashboard", path: "/dashboard" },
  {
    name: "settings",
    path: "/settings",
    canDeactivate: settingsDeactivateGuard,
  },
  {
    name: "admin",
    path: "/admin",
    canActivate: adminGuard,
  },
];
