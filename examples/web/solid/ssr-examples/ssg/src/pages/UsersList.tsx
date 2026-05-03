import { Link, useRoute } from "@real-router/solid";
import { For } from "solid-js";

import type { UsersListData } from "../router/loaders";
import type { JSX } from "solid-js";

const EMPTY_DATA: UsersListData = { users: [] };

export function UsersList(): JSX.Element {
  const routeState = useRoute();
  const data = (): UsersListData =>
    (routeState().route.context.data as UsersListData | undefined) ?? EMPTY_DATA;

  return (
    <div>
      <h2>All Users</h2>
      <ul>
        <For each={data().users}>
          {(user) => (
            <li>
              <Link routeName="users.profile" routeParams={{ id: user.id }}>
                {user.name}
              </Link>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
