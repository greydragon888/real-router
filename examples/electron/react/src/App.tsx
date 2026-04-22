import { RouteView } from "@real-router/react";

import { Dashboard } from "./pages/Dashboard";
import { Home } from "./pages/Home";
import { Settings } from "./pages/Settings";
import { UserDetail } from "./pages/UserDetail";
import { UserEdit } from "./pages/UserEdit";
import { UsersList } from "./pages/UsersList";
import { Layout } from "../../../react/shared/Layout";

import type { JSX } from "react";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "dashboard", label: "Dashboard" },
  { routeName: "settings", label: "Settings" },
  { routeName: "users", label: "Users" },
];

export function App(): JSX.Element {
  return (
    <Layout title="Real-Router — Electron + browser-plugin" links={links}>
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
