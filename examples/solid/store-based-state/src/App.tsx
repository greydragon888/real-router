import { Link, RouteView } from "@real-router/solid";

import { Home } from "./pages/Home";
import { UserPage } from "./pages/UserPage";
import { Layout } from "../../shared/Layout";

import type { JSX } from "solid-js";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "users.profile", label: "User 42" },
];

export function App(): JSX.Element {
  return (
    <Layout title="Real-Router — Store-Based State" links={links}>
      <div class="card" style={{ "margin-bottom": "16px" }}>
        <strong>Quick Navigation</strong>
        <div style={{ display: "flex", gap: "8px", "margin-top": "8px" }}>
          <Link routeName="users.profile" routeParams={{ id: "42" }}>
            /users/42
          </Link>
          <Link routeName="users.profile" routeParams={{ id: "42", page: "1" }}>
            /users/42?page=1
          </Link>
          <Link routeName="users.profile" routeParams={{ id: "42", page: "2" }}>
            /users/42?page=2
          </Link>
          <Link routeName="users.profile" routeParams={{ id: "99" }}>
            /users/99
          </Link>
        </div>
      </div>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="users">
          <RouteView nodeName="users">
            <RouteView.Match segment="profile">
              <UserPage />
            </RouteView.Match>
          </RouteView>
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}
