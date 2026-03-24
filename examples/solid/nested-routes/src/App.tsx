import { RouteView } from "@real-router/solid";

import { Home } from "./pages/Home";
import { UsersLayout } from "./pages/UsersLayout";
import { Layout } from "../../shared/Layout";

import type { JSX } from "solid-js";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "users", label: "Users" },
];

export function App(): JSX.Element {
  return (
    <Layout title="Real-Router — Nested Routes" links={links}>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="users">
          <UsersLayout />
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}
