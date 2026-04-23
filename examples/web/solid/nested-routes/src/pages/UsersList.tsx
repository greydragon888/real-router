import { Link } from "@real-router/solid";
import { For } from "solid-js";

import type { JSX } from "solid-js";

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
      <For each={users}>
        {(user) => (
          <div class="card">
            <strong>{user.name}</strong>
            <span style={{ "margin-left": "8px", color: "#888" }}>
              {user.role}
            </span>
            <div style={{ "margin-top": "8px" }}>
              <Link routeName="users.profile" routeParams={{ id: user.id }}>
                View Profile →
              </Link>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
