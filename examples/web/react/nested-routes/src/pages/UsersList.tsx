import { Link } from "@real-router/react";

import type { JSX } from "react";

const users = [
  { id: "1", name: "Alice", role: "Admin" },
  { id: "2", name: "Bob", role: "Editor" },
  { id: "3", name: "Carol", role: "Viewer" },
];

export function UsersList(): JSX.Element {
  return (
    <div>
      <h1>Users</h1>
      <p>Click a user to view their profile. Notice how breadcrumbs update.</p>
      {users.map((user) => (
        <div key={user.id} className="card">
          <strong>{user.name}</strong>
          <span style={{ marginLeft: "8px", color: "#888" }}>{user.role}</span>
          <div style={{ marginTop: "8px" }}>
            <Link routeName="users.profile" routeParams={{ id: user.id }}>
              View Profile →
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
