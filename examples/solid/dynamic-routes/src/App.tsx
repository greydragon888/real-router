import { getRoutesApi } from "@real-router/core/api";
import {
  Link,
  RouteView,
  useNavigator,
  useRoute,
  useRouter,
} from "@real-router/solid";
import { createSignal, Show } from "solid-js";

import { About } from "./pages/About";
import { Admin } from "./pages/Admin";
import { Analytics } from "./pages/Analytics";
import { Home } from "./pages/Home";
import { analyticsRoute, adminRoutes } from "./routes";

import type { JSX } from "solid-js";

export function App(): JSX.Element {
  const router = useRouter();
  const navigator = useNavigator();
  const routeState = useRoute();
  const routesApi = getRoutesApi(router);

  const [analyticsEnabled, setAnalyticsEnabled] = createSignal(false);
  const [adminEnabled, setAdminEnabled] = createSignal(false);

  const toggleAnalytics = async () => {
    if (analyticsEnabled()) {
      const route = routeState().route;

      if (route?.name.startsWith("analytics")) {
        await navigator.navigate("home");
      }

      routesApi.remove("analytics");
      setAnalyticsEnabled(false);
    } else {
      routesApi.add(analyticsRoute);
      setAnalyticsEnabled(true);
    }
  };

  const toggleAdmin = async () => {
    if (adminEnabled()) {
      const route = routeState().route;

      if (route?.name.startsWith("admin")) {
        await navigator.navigate("home");
      }

      routesApi.remove("admin");
      setAdminEnabled(false);
    } else {
      routesApi.add(adminRoutes);
      setAdminEnabled(true);
    }
  };

  return (
    <div class="app">
      <header class="header">Real-Router — Dynamic Routes</header>
      <aside class="sidebar">
        <Link routeName="home" activeClassName="active">
          Home
        </Link>
        <Link routeName="about" activeClassName="active">
          About
        </Link>
        <Show when={analyticsEnabled()}>
          <Link routeName="analytics" activeClassName="active">
            Analytics
          </Link>
        </Show>
        <Show when={adminEnabled()}>
          <Link routeName="admin" activeClassName="active">
            Admin
          </Link>
          <Link
            routeName="admin.users"
            activeClassName="active"
            style={{ "padding-left": "36px" }}
          >
            Users
          </Link>
          <Link
            routeName="admin.settings"
            activeClassName="active"
            style={{ "padding-left": "36px" }}
          >
            Settings
          </Link>
        </Show>

        <div
          style={{
            padding: "16px 24px",
            "border-top": "1px solid #e0e0e0",
            "margin-top": "8px",
          }}
        >
          <strong
            style={{
              "font-size": "12px",
              color: "#888",
              display: "block",
              "margin-bottom": "8px",
            }}
          >
            FEATURE FLAGS
          </strong>
          <div class="toggle">
            <input
              id="analytics-toggle"
              type="checkbox"
              checked={analyticsEnabled()}
              onChange={toggleAnalytics}
            />
            <label for="analytics-toggle">Analytics</label>
          </div>
          <div class="toggle">
            <input
              id="admin-toggle"
              type="checkbox"
              checked={adminEnabled()}
              onChange={toggleAdmin}
            />
            <label for="admin-toggle">Admin Panel</label>
          </div>
        </div>
      </aside>

      <main class="content">
        <RouteTree
          analyticsEnabled={analyticsEnabled()}
          adminEnabled={adminEnabled()}
        />
        <RouteView nodeName="">
          <RouteView.Match segment="home">
            <Home />
          </RouteView.Match>
          <RouteView.Match segment="about">
            <About />
          </RouteView.Match>
          <Show when={analyticsEnabled()}>
            <RouteView.Match segment="analytics">
              <Analytics />
            </RouteView.Match>
          </Show>
          <Show when={adminEnabled()}>
            <RouteView.Match segment="admin">
              <Admin />
            </RouteView.Match>
          </Show>
          <RouteView.NotFound>
            <h1>404 — Page Not Found</h1>
          </RouteView.NotFound>
        </RouteView>
      </main>
      <footer class="footer">@real-router/solid</footer>
    </div>
  );
}

interface RouteTreeProps {
  readonly analyticsEnabled: boolean;
  readonly adminEnabled: boolean;
}

function RouteTree(props: RouteTreeProps): JSX.Element {
  const routes = () => [
    "home (/)",
    "about (/about)",
    ...(props.analyticsEnabled ? ["analytics (/analytics)"] : []),
    ...(props.adminEnabled
      ? [
          "admin (/admin)",
          "  admin.users (/users)",
          "  admin.settings (/settings)",
        ]
      : []),
  ];

  return (
    <div class="card" style={{ "margin-bottom": "16px", "font-size": "13px" }}>
      <strong>Active route tree</strong>
      <pre style={{ "margin-top": "8px", color: "#444", "line-height": "1.6" }}>
        {routes().join("\n")}
      </pre>
    </div>
  );
}
