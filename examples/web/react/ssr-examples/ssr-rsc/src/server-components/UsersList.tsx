import { database } from "../database";

import type { ReactElement } from "react";

interface UsersListProps {
  readonly roleFilter?: "admin" | "user";
}

export async function UsersList({
  roleFilter,
}: UsersListProps): Promise<ReactElement> {
  const users = await database.users.list(
    roleFilter ? { role: roleFilter } : undefined,
  );

  return (
    <section data-testid="users-list" data-role-filter={roleFilter ?? "all"}>
      <h1>{roleFilter ? `Users (${roleFilter})` : "Users"}</h1>
      <ul>
        {users.map((user) => (
          <li key={user.id} data-user-id={user.id} data-user-role={user.role}>
            {user.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
