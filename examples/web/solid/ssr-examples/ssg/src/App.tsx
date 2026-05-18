import { UNKNOWN_ROUTE } from "@real-router/core";
import { Link, RouteView, useRoute } from "@real-router/solid";
import { Show } from "solid-js";

import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { UserProfile } from "./pages/UserProfile";
import { UsersList } from "./pages/UsersList";

import type { JSX } from "solid-js";

// Top-level <Show> handles UNKNOWN_ROUTE — see examples/web/solid/
// ssr-examples/ssr/src/App.tsx for the hydration-key gap rationale that
// makes a `RouteView.NotFound` sibling unsafe under vite-plugin-solid 2.11.x.
export function App(): JSX.Element {
  const routeState = useRoute();
  const isKnownRoute = (): boolean => routeState().route.name !== UNKNOWN_ROUTE;

  return (
    <div>
      <nav>
        <Link routeName="home">Home</Link>
        {" | "}
        <Link routeName="users">Users</Link>
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
          </RouteView>
        </Show>
      </main>
    </div>
  );
}
