import { useRoute, useRouter } from "@real-router/react";

import { HistoryPanel } from "./HistoryPanel";
import { Dashboard } from "./pages/Dashboard";
import { Home } from "./pages/Home";
import { Settings } from "./pages/Settings";
import { UserDetail } from "./pages/UserDetail";
import { UserEdit } from "./pages/UserEdit";
import { UsersList } from "./pages/UsersList";
import { Layout } from "../../../react/shared/Layout";

import type { JSX } from "react";

export function App(): JSX.Element {
  const router = useRouter();
  const { route } = useRoute();

  const mark = (name: string): string =>
    router.hasVisited(name) ? " ✓" : "";

  const links = [
    { routeName: "home", label: `Home${mark("home")}` },
    { routeName: "dashboard", label: `Dashboard${mark("dashboard")}` },
    { routeName: "settings", label: `Settings${mark("settings")}` },
    { routeName: "users", label: `Users${mark("users")}` },
  ];

  return (
    <Layout
      title="Real-Router — Electron + navigation-plugin"
      links={links}
    >
      <HistoryPanel />

      {route?.name === "home" && <Home />}
      {route?.name === "dashboard" && <Dashboard />}
      {route?.name === "settings" && <Settings />}
      {route?.name === "users" && <UsersList />}
      {route?.name === "users.user" && <UserDetail />}
      {route?.name === "users.user.edit" && <UserEdit />}
    </Layout>
  );
}
