import { database } from "../database";

import type { ReactElement } from "react";

export async function UsersList(): Promise<ReactElement> {
  const users = await database.users.list();

  return (
    <section data-testid="users-list">
      <h1>Users</h1>
      <ul>
        {users.map((user) => (
          <li key={user.id} data-user-id={user.id}>
            {user.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
