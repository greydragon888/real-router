import { Link, RouteView } from "@real-router/react";

import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { UserProfile } from "./pages/UserProfile";
import { UsersList } from "./pages/UsersList";

import type { JSX } from "react";

export function App(): JSX.Element {
  return (
    <div>
      <nav>
        <Link routeName="home">Home</Link>
        {" | "}
        <Link routeName="users.list">Users</Link>
      </nav>
      <main>
        <RouteView nodeName="">
          <RouteView.Match segment="home">
            <Home />
          </RouteView.Match>
          <RouteView.Match segment="users">
            <h1>Users</h1>
            <RouteView nodeName="users">
              <RouteView.Match segment="list">
                <UsersList />
              </RouteView.Match>
              <RouteView.Match segment="profile">
                <UserProfile />
              </RouteView.Match>
            </RouteView>
          </RouteView.Match>
          <RouteView.NotFound>
            <NotFound />
          </RouteView.NotFound>
        </RouteView>
      </main>
    </div>
  );
}
