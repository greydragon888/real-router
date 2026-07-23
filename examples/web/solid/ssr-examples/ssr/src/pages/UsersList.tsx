import { Link, useRoute } from "@real-router/solid";
import { For, Show } from "solid-js";

import type { UsersListData } from "../router/loaders";
import type { JSX } from "solid-js";

const EMPTY_DATA: UsersListData = { users: [], sort: "asc" };

export function UsersList(): JSX.Element {
  const routeState = useRoute();
  const data = (): UsersListData =>
    (routeState().route.context.data as UsersListData | undefined) ??
    EMPTY_DATA;
  const otherSort = (): "asc" | "desc" =>
    data().sort === "asc" ? "desc" : "asc";

  return (
    <div>
      <h2>All Users</h2>
      <p data-testid="current-sort">Sorted: {data().sort}</p>
      <Link
        routeName="users"
        routeSearch={{ sort: otherSort() }}
        data-testid="toggle-sort"
      >
        Toggle to {otherSort()}
      </Link>
      <ul data-testid="users-list">
        <For each={data().users}>
          {(user) => (
            <li data-user-id={user.id}>
              <Link routeName="users.profile" routeParams={{ id: user.id }}>
                {user.name}
              </Link>
              {" — "}
              <span data-testid={`role-${user.id}`}>{user.role}</span>
            </li>
          )}
        </For>
      </ul>
      <Show when={data().users.length === 0}>
        <p>No users found.</p>
      </Show>
    </div>
  );
}
