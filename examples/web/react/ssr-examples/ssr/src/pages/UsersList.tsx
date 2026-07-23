import { Link, useRoute } from "@real-router/react";

import type { UsersListData } from "../router/loaders";
import type { JSX } from "react";

export function UsersList(): JSX.Element {
  const { route } = useRoute();
  const data = (route.context.data ?? {
    users: [],
    sort: "asc",
  }) as UsersListData;

  const otherSort = data.sort === "asc" ? "desc" : "asc";

  return (
    <div>
      <h2>All Users</h2>
      <p data-testid="current-sort">Sorted: {data.sort}</p>
      <Link
        routeName="users"
        routeSearch={{ sort: otherSort }}
        data-testid="toggle-sort"
      >
        Toggle to {otherSort}
      </Link>
      <ul data-testid="users-list">
        {data.users.map((user) => (
          <li key={user.id} data-user-id={user.id}>
            <Link routeName="users.profile" routeParams={{ id: user.id }}>
              {user.name}
            </Link>
            {" — "}
            <span data-testid={`role-${user.id}`}>{user.role}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
