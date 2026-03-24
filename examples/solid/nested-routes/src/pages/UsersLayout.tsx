import {
  Link,
  RouteView,
  useRoute,
  useRouteNode,
  useRouteUtils,
} from "@real-router/solid";
import { For, Show } from "solid-js";

import { UserProfile } from "./UserProfile";
import { UserSettings } from "./UserSettings";
import { UsersList } from "./UsersList";

import type { Params } from "@real-router/core";
import type { JSX } from "solid-js";

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

function Breadcrumbs(): JSX.Element {
  const routeState = useRoute();
  const utils = useRouteUtils();

  return (
    <Show when={routeState().route}>
      {(route) => {
        const chain = () => utils.getChain(route().name) ?? [route().name];
        const crumbs = () => ["home", ...chain()];

        return (
          <nav class="breadcrumbs" aria-label="breadcrumb">
            <For each={crumbs()}>
              {(name, i) => {
                const isLast = () => i() === crumbs().length - 1;
                const label = () => getLabel(name, route().params);

                return (
                  <>
                    <Show when={i() > 0}>
                      <span> › </span>
                    </Show>
                    <Show when={isLast()} fallback={<Link routeName={name}>{label()}</Link>}>
                      <span>{label()}</span>
                    </Show>
                  </>
                );
              }}
            </For>
          </nav>
        );
      }}
    </Show>
  );
}

export function UsersLayout(): JSX.Element {
  const nodeState = useRouteNode("users");

  return (
    <Show when={nodeState().route}>
      <div>
        <Breadcrumbs />

        <div style={{ display: "flex", gap: "24px", "margin-top": "16px" }}>
          <nav style={{ "min-width": "140px" }}>
            <p
              style={{
                "font-size": "12px",
                "text-transform": "uppercase",
                color: "#888",
                "margin-bottom": "8px",
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
                "text-decoration": "none",
                color: "#555",
                "border-radius": "4px",
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
                "text-decoration": "none",
                color: "#555",
                "border-radius": "4px",
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
    </Show>
  );
}
