import { getRoutesApi } from "@real-router/core/api";
import {
  Link,
  RouteView,
  useNavigator,
  useRoute,
  useRouter,
} from "@real-router/preact";
import { useState } from "preact/hooks";

import { About } from "./pages/About";
import { Admin } from "./pages/Admin";
import { Analytics } from "./pages/Analytics";
import { Home } from "./pages/Home";
import { analyticsRoute, adminRoutes } from "./routes";

import type { JSX } from "preact";

export function App(): JSX.Element {
  const router = useRouter();
  const navigator = useNavigator();
  const { route } = useRoute();
  const routesApi = getRoutesApi(router);

  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [adminEnabled, setAdminEnabled] = useState(false);

  const toggleAnalytics = async () => {
    if (analyticsEnabled) {
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
    if (adminEnabled) {
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
    <div className="app">
      <header className="header">Real-Router — Dynamic Routes</header>
      <aside className="sidebar">
        <Link routeName="home" activeClassName="active">
          Home
        </Link>
        <Link routeName="about" activeClassName="active">
          About
        </Link>
        {analyticsEnabled && (
          <Link routeName="analytics" activeClassName="active">
            Analytics
          </Link>
        )}
        {adminEnabled && (
          <>
            <Link routeName="admin" activeClassName="active">
              Admin
            </Link>
            <Link
              routeName="admin.users"
              activeClassName="active"
              style={{ paddingLeft: "36px" }}
            >
              Users
            </Link>
            <Link
              routeName="admin.settings"
              activeClassName="active"
              style={{ paddingLeft: "36px" }}
            >
              Settings
            </Link>
          </>
        )}

        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e0e0e0",
            marginTop: "8px",
          }}
        >
          <strong
            style={{
              fontSize: "12px",
              color: "#888",
              display: "block",
              marginBottom: "8px",
            }}
          >
            FEATURE FLAGS
          </strong>
          <div className="toggle">
            <input
              id="analytics-toggle"
              type="checkbox"
              checked={analyticsEnabled}
              onChange={toggleAnalytics}
            />
            <label htmlFor="analytics-toggle">Analytics</label>
          </div>
          <div className="toggle">
            <input
              id="admin-toggle"
              type="checkbox"
              checked={adminEnabled}
              onChange={toggleAdmin}
            />
            <label htmlFor="admin-toggle">Admin Panel</label>
          </div>
        </div>
      </aside>

      <main className="content">
        <RouteTree
          analyticsEnabled={analyticsEnabled}
          adminEnabled={adminEnabled}
        />
        <RouteView nodeName="">
          <RouteView.Match segment="home">
            <Home />
          </RouteView.Match>
          <RouteView.Match segment="about">
            <About />
          </RouteView.Match>
          {analyticsEnabled && (
            <RouteView.Match segment="analytics">
              <Analytics />
            </RouteView.Match>
          )}
          {adminEnabled && (
            <RouteView.Match segment="admin">
              <Admin />
            </RouteView.Match>
          )}
          <RouteView.NotFound>
            <h1>404 — Page Not Found</h1>
          </RouteView.NotFound>
        </RouteView>
      </main>
      <footer className="footer">@real-router/preact</footer>
    </div>
  );
}

interface RouteTreeProps {
  readonly analyticsEnabled: boolean;
  readonly adminEnabled: boolean;
}

function RouteTree({
  analyticsEnabled,
  adminEnabled,
}: RouteTreeProps): JSX.Element {
  const routes = [
    "home (/)",
    "about (/about)",
    ...(analyticsEnabled ? ["analytics (/analytics)"] : []),
    ...(adminEnabled
      ? [
          "admin (/admin)",
          "  admin.users (/users)",
          "  admin.settings (/settings)",
        ]
      : []),
  ];

  return (
    <div className="card" style={{ marginBottom: "16px", fontSize: "13px" }}>
      <strong>Active route tree</strong>
      <pre style={{ marginTop: "8px", color: "#444", lineHeight: "1.6" }}>
        {routes.join("\n")}
      </pre>
    </div>
  );
}
