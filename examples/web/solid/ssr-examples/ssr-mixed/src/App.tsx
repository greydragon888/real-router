import { UNKNOWN_ROUTE } from "@real-router/core";
import { Link, useRoute } from "@real-router/solid";
import { Match, Switch } from "solid-js";

import { AdminDashboard } from "./pages/Admin";
import { Doc } from "./pages/Doc";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { UserProfile } from "./pages/UserProfile";

import type { JSX } from "solid-js";

export function App(): JSX.Element {
  const routeState = useRoute();
  const name = (): string => routeState().route.name;

  return (
    <div>
      <nav>
        <Link routeName="home">Home</Link>
        {" | "}
        <Link routeName="admin.dashboard">Admin (client-only)</Link>
        {" | "}
        <Link routeName="users.profile" routeParams={{ id: "42" }}>
          User 42 (data-only)
        </Link>
        {" | "}
        <Link routeName="docs.detail" routeParams={{ id: "guide" }}>
          Doc HTML
        </Link>
        {" | "}
        <Link
          routeName="docs.detail"
          routeParams={{ id: "guide" }}
          routeSearch={{ format: "pdf" }}
        >
          Doc PDF (client-only)
        </Link>
      </nav>
      <hr />
      <Switch>
        <Match when={name() === "home"}>
          <Home />
        </Match>
        <Match when={name() === "admin.dashboard"}>
          <AdminDashboard />
        </Match>
        <Match when={name() === "users.profile"}>
          <UserProfile />
        </Match>
        <Match when={name() === "docs.detail"}>
          <Doc />
        </Match>
        <Match when={name() === UNKNOWN_ROUTE}>
          <NotFound />
        </Match>
      </Switch>
    </div>
  );
}
