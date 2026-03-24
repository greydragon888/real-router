import {
  Link,
  RouteView,
  useRoute,
  useRouteNode,
  useRouteUtils,
} from "@real-router/react";
import { Fragment } from "react";

import type { Params } from "@real-router/core";
import type { JSX } from "react";

const routeLabels: Record<string, string> = {
  home: "Home",
  users: "Users",
  "users.list": "List",
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

function UsersList(): JSX.Element {
  return (
    <div>
      <h1>Users</h1>
      <div className="card">
        <Link routeName="users.profile" routeParams={{ id: "1" }}>
          User #1 — Alice
        </Link>
      </div>
      <div className="card">
        <Link routeName="users.profile" routeParams={{ id: "2" }}>
          User #2 — Bob
        </Link>
      </div>
      <div className="card">
        <Link routeName="users.profile" routeParams={{ id: "3" }}>
          User #3 — Carol
        </Link>
      </div>
    </div>
  );
}

function UserProfile(): JSX.Element {
  const { route } = useRouteNode("users.profile");
  let id = "?";

  if (route && typeof route.params.id === "string") {
    id = route.params.id;
  }

  return (
    <div>
      <h1>User #{id}</h1>
      <div className="card">
        <p>Profile for user {id}</p>
      </div>
      <Link routeName="users.list">← Back to list</Link>
    </div>
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
        <nav style={{ minWidth: "120px" }}>
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
        </nav>
        <div style={{ flex: 1 }}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list">
              <UsersList />
            </RouteView.Match>
            <RouteView.Match segment="profile">
              <UserProfile />
            </RouteView.Match>
          </RouteView>
        </div>
      </div>
    </div>
  );
}
