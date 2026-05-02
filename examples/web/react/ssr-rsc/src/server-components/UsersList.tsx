import { db } from "../db";

export async function UsersList() {
  const users = await db.users.list();

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
