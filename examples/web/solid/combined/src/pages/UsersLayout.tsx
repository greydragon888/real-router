import {
  Link,
  RouteView,
  useRoute,
  useRouteNode,
  useRouteUtils,
} from "@real-router/solid";
import { For, Show } from "solid-js";

import type { Params } from "@real-router/core";
import type { JSX } from "solid-js";

const routeLabels: Record<string, string> = {
  home: "Home",
  users: "Users",
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

function UsersList(): JSX.Element {
  return (
    <div>
      <h1>Users</h1>
      <div class="card">
        <Link routeName="users.profile" routeParams={{ id: "1" }}>
          User #1 — Alice
        </Link>
      </div>
      <div class="card">
        <Link routeName="users.profile" routeParams={{ id: "2" }}>
          User #2 — Bob
        </Link>
      </div>
      <div class="card">
        <Link routeName="users.profile" routeParams={{ id: "3" }}>
          User #3 — Carol
        </Link>
      </div>
    </div>
  );
}

function UserProfile(): JSX.Element {
  const nodeState = useRouteNode("users.profile");

  const id = () => {
    const route = nodeState().route;

    return route && typeof route.params.id === "string" ? route.params.id : "?";
  };

  return (
    <div>
      <h1>User #{id()}</h1>
      <div class="card">
        <p>Profile for user {id()}</p>
      </div>
      <Link routeName="users">← Back to list</Link>
    </div>
  );
}

export function UsersLayout(): JSX.Element {
  const nodeState = useRouteNode("users");

  return (
    <Show when={nodeState().route}>
      <div>
        <Breadcrumbs />
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
