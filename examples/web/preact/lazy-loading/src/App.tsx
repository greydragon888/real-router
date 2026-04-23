import { RouteView } from "@real-router/preact";
import { lazy } from "preact/compat";

import { Home } from "./pages/Home";
import { Spinner } from "./Spinner";
import { Layout } from "../../shared/Layout";

import type { JSX } from "preact";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "dashboard", label: "Dashboard" },
  { routeName: "analytics", label: "Analytics" },
  { routeName: "settings", label: "Settings" },
];

export function App(): JSX.Element {
  return (
    <Layout title="Real-Router — Lazy Loading" links={links}>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="dashboard" fallback={<Spinner />}>
          <Dashboard />
        </RouteView.Match>
        <RouteView.Match segment="analytics" fallback={<Spinner />}>
          <Analytics />
        </RouteView.Match>
        <RouteView.Match segment="settings" fallback={<Spinner />}>
          <Settings />
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}
