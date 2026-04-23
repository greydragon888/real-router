import {
  Link,
  RouteView,
  useRoute,
  useRouteNode,
  useRouteUtils,
} from "@real-router/react";
import { Fragment } from "react";

import { UserProfile } from "./UserProfile";
import { UserSettings } from "./UserSettings";
import { UsersList } from "./UsersList";

import type { Params } from "@real-router/core";
import type { JSX } from "react";

const routeLabels: Record<string, string> = {
  home: "Home",
  users: "Users",
  "users.list": "List",
  "users.settings": "Settings",
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

      <div style={{ display: "flex", gap: "24px", marginTop: "16px" }}>
        <nav style={{ minWidth: "140px" }}>
          <p
            style={{
              fontSize: "12px",
              textTransform: "uppercase",
              color: "#888",
              marginBottom: "8px",
            }}
          >
            Users
          </p>
          <Link
            routeName="users.list"
            activeClassName="active"
            style={{
              display: "block",
              padding: "6px 12px",
              textDecoration: "none",
              color: "#555",
              borderRadius: "4px",
            }}
          >
            List
          </Link>
          <Link
            routeName="users.settings"
            activeClassName="active"
            style={{
              display: "block",
              padding: "6px 12px",
              textDecoration: "none",
              color: "#555",
              borderRadius: "4px",
            }}
          >
            Settings
          </Link>
        </nav>

        <div style={{ flex: 1 }}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list">
              <UsersList />
            </RouteView.Match>
            <RouteView.Match segment="profile">
              <UserProfile />
            </RouteView.Match>
            <RouteView.Match segment="settings">
              <UserSettings />
            </RouteView.Match>
          </RouteView>
        </div>
      </div>
    </div>
  );
}
