import { Link, RouteView } from "@real-router/preact";

import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { UserProfile } from "./pages/UserProfile";
import { UsersList } from "./pages/UsersList";

import type { JSX } from "preact";

export function App(): JSX.Element {
  return (
    <div>
      <nav>
        <Link routeName="home">Home</Link>
        {" | "}
        <Link routeName="users">Users</Link>
      </nav>
      <main>
        <RouteView nodeName="">
          <RouteView.Match segment="home">
            <Home />
          </RouteView.Match>
          <RouteView.Match segment="users">
            <RouteView nodeName="users">
              <RouteView.Self>
                <UsersList />
              </RouteView.Self>
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
