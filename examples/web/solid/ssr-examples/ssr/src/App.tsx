import { UNKNOWN_ROUTE } from "@real-router/core";
import { Link, RouteView, useRoute } from "@real-router/solid";
import { Show } from "solid-js";

import { Admin } from "./pages/Admin";
import { Dashboard } from "./pages/Dashboard";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { UserProfile } from "./pages/UserProfile";
import { UsersList } from "./pages/UsersList";

import type { JSX } from "solid-js";

// Top-level <Show> handles UNKNOWN_ROUTE so RouteView never has to render a
// `RouteView.NotFound` branch. With multiple `RouteView.Match` siblings plus
// `RouteView.NotFound`, vite-plugin-solid 2.11.x emits divergent
// hydration-key counters between the SSR and DOM codegens, producing
// "Hydration Mismatch. Unable to find DOM nodes for hydration key" on first
// paint. Matching React's pattern (route-level NotFound out, app-level Show
// in) sidesteps the mismatch without modifying the adapter.
export function App(): JSX.Element {
  const routeState = useRoute();
  const isKnownRoute = (): boolean => routeState().route.name !== UNKNOWN_ROUTE;

  return (
    <div>
      <nav>
        <Link routeName="home">Home</Link>
        {" | "}
        <Link routeName="users">Users</Link>
        {" | "}
        <Link routeName="dashboard">Dashboard</Link>
        {" | "}
        <Link routeName="admin" data-testid="nav-admin">
          Admin
        </Link>
      </nav>
      <main>
        <Show when={isKnownRoute()} fallback={<NotFound />}>
          <RouteView nodeName="">
            <RouteView.Match segment="home">
              <Home />
            </RouteView.Match>
            <RouteView.Match segment="users">
              <div>
                <h1>Users</h1>
                <RouteView nodeName="users">
                  <RouteView.Self>
                    <UsersList />
                  </RouteView.Self>
                  <RouteView.Match segment="profile">
                    <UserProfile />
                  </RouteView.Match>
                </RouteView>
              </div>
            </RouteView.Match>
            <RouteView.Match segment="dashboard">
              <Dashboard />
            </RouteView.Match>
            <RouteView.Match segment="admin">
              <Admin />
            </RouteView.Match>
          </RouteView>
        </Show>
      </main>
    </div>
  );
}
