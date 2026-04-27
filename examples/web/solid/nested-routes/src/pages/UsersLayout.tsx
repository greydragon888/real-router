import {
  Link,
  RouteView,
  useRoute,
  useRouteNode,
  useRouteUtils,
} from "@real-router/solid";
import { For, Show } from "solid-js";

import { UserProfile } from "./UserProfile";
import { UsersList } from "./UsersList";

import type { Params } from "@real-router/core";
import type { JSX } from "solid-js";

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
                    <Show
                      when={isLast()}
                      fallback={<Link routeName={name}>{label()}</Link>}
                    >
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

        {/*
          `users` IS the list — no synthetic `list` child / forwardTo.
          <RouteView.Self> renders UsersList when active is exactly `users`;
          <RouteView.Match segment="profile"> wins for /users/:id and deeper.
        */}
        <div style={{ "margin-top": "16px" }}>
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
    </Show>
  );
}
