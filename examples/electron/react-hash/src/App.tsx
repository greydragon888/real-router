import { useRoute } from "@real-router/react";

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
  const { route } = useRoute();

  return (
    <Layout title="Real-Router — Electron + hash-plugin" links={links}>
      {route?.name === "home" && <Home />}
      {route?.name === "dashboard" && <Dashboard />}
      {route?.name === "settings" && <Settings />}
      {route?.name === "users" && <UsersList />}
      {route?.name === "users.user" && <UserDetail />}
      {route?.name === "users.user.edit" && <UserEdit />}
    </Layout>
  );
}
