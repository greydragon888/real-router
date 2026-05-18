import { Link, useRoute } from "@real-router/preact";

import type { UsersListData } from "../router/loaders";
import type { JSX } from "preact";

export function UsersList(): JSX.Element {
  const { route } = useRoute();
  const data = (route.context.data ?? { users: [] }) as UsersListData;

  return (
    <div>
      <h1>All Users</h1>
      <ul data-testid="users-list">
        {data.users.map((user) => (
          <li key={user.id} data-user-id={user.id}>
            <Link routeName="users.profile" routeParams={{ id: user.id }}>
              {user.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
