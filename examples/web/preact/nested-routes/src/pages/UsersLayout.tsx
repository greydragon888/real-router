import {
  Link,
  RouteView,
  useRoute,
  useRouteNode,
  useRouteUtils,
} from "@real-router/preact";
import { Fragment } from "preact";

import { UserProfile } from "./UserProfile";
import { UsersList } from "./UsersList";

import type { Params } from "@real-router/core";
import type { JSX } from "preact";

const routeLabels: Record<string, string> = {
  home: "Home",
  users: "Users",
  "users.profile.settings": "Settings",
};

function getLabel(name: string, params: Params): string {
  if (name in routeLabels) {
    return routeLabels[name];
  }

  if (name === "users.profile") {
    const id = typeof params.id === "string" ? params.id : "?";

    return `User #${id}`;
  }

  return name;
}

function Breadcrumbs(): JSX.Element | null {
  const { route } = useRoute();
  const utils = useRouteUtils();

  if (!route) {
    return null;
  }

  const chain = utils.getChain(route.name) ?? [route.name];
  const crumbs = ["home", ...chain];

  return (
    <nav className="breadcrumbs" aria-label="breadcrumb">
      {crumbs.map((name, i) => {
        const isLast = i === crumbs.length - 1;
        const label = getLabel(name, route.params);

        return (
          <Fragment key={name}>
            {i > 0 && <span> › </span>}
            {isLast ? (
              <span>{label}</span>
            ) : (
              <Link routeName={name}>{label}</Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

export function UsersLayout(): JSX.Element | null {
  const { route } = useRouteNode("users");

  if (!route) {
    return null;
  }

  return (
    <div>
      <Breadcrumbs />

      <div style={{ marginTop: "16px" }}>
        {/*
          `users` route IS the list — no synthetic `list` child / forwardTo.
          <RouteView.Self> renders UsersList when active route is exactly
          `users`; <RouteView.Match segment="profile"> wins for /users/:id and
          deeper (UserProfile owns its own sub-navigation between profile-info
          and per-user Settings).
        */}
        <RouteView nodeName="users">
          <RouteView.Self>
            <UsersList />
          </RouteView.Self>
          <RouteView.Match segment="profile">
            <UserProfile />
          </RouteView.Match>
        </RouteView>
      </div>
    </div>
  );
}
