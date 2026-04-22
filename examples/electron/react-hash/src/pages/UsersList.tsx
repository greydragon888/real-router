import { Link } from "@real-router/react";

import type { JSX } from "react";

const users = [
  { id: "42", name: "Alice" },
  { id: "43", name: "Bob" },
  { id: "44", name: "Carol" },
];

export function UsersList(): JSX.Element {
  return (
    <section>
      <h1>Users</h1>
      <p>Click a user to open their detail page.</p>
      <ul>
        {users.map((user) => (
          <li key={user.id}>
            <Link routeName="users.user" routeParams={{ id: user.id }}>
              {user.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
