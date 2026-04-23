import { useRouteNode } from "@real-router/react";

import type { JSX } from "react";

const userData: Record<string, { name: string; role: string; email: string }> =
  {
    "1": { name: "Alice", role: "Admin", email: "alice@example.com" },
    "2": { name: "Bob", role: "Editor", email: "bob@example.com" },
    "3": { name: "Carol", role: "Viewer", email: "carol@example.com" },
  };

export function UserProfile(): JSX.Element {
  const { route } = useRouteNode("users.profile");
  let id = "";

  if (route) {
    id = typeof route.params.id === "string" ? route.params.id : "";
  }

  const user = id ? userData[id] : undefined;

  if (!user) {
    return (
      <div>
        <h1>User Not Found</h1>
        <p>No user with ID {id}.</p>
      </div>
    );
  }

  return (
    <div>
      <h1>{user.name}</h1>
      <div className="card">
        <p>
          <strong>Role:</strong> {user.role}
        </p>
        <p>
          <strong>Email:</strong> {user.email}
        </p>
        <p>
          <strong>ID:</strong> {id}
        </p>
      </div>
      <p>
        Notice that <strong>Users</strong> in the outer sidebar remains active
        (ancestor matching) while you browse profiles.
      </p>
    </div>
  );
}
