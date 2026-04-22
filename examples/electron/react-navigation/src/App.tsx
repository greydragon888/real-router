import { RouteView, useRoute, useRouter } from "@real-router/react";

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
  // Subscribe to route changes so visited-marks re-render on navigation.
  useRoute();

  const mark = (name: string): string => (router.hasVisited(name) ? " ✓" : "");

  const links = [
    { routeName: "home", label: `Home${mark("home")}` },
    { routeName: "dashboard", label: `Dashboard${mark("dashboard")}` },
    { routeName: "settings", label: `Settings${mark("settings")}` },
    { routeName: "users", label: `Users${mark("users")}` },
  ];

  return (
    <Layout title="Real-Router — Electron + navigation-plugin" links={links}>
      <HistoryPanel />

      <RouteView nodeName="">
        <RouteView.Match segment="home" exact>
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="dashboard" exact>
          <Dashboard />
        </RouteView.Match>
        <RouteView.Match segment="settings" exact>
          <Settings />
        </RouteView.Match>
        <RouteView.Match segment="users" exact>
          <UsersList />
        </RouteView.Match>
        <RouteView.Match segment="users.user" exact>
          <UserDetail />
        </RouteView.Match>
        <RouteView.Match segment="users.user.edit" exact>
          <UserEdit />
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}
