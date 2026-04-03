import { useRouteNode } from "@real-router/solid";
import { Show } from "solid-js";

import type { JSX } from "solid-js";

const userData: Record<string, { name: string; role: string; email: string }> =
  {
    "1": { name: "Alice", role: "Admin", email: "alice@example.com" },
    "2": { name: "Bob", role: "Editor", email: "bob@example.com" },
    "3": { name: "Carol", role: "Viewer", email: "carol@example.com" },
  };

export function UserProfile(): JSX.Element {
  const nodeState = useRouteNode("users.profile");

  const id = () => {
    const route = nodeState().route;

    return route && typeof route.params.id === "string" ? route.params.id : "";
  };

  const user = () => (id() ? userData[id()] : undefined);

  return (
    <Show
      when={user()}
      fallback={
        <div>
          <h1>User Not Found</h1>
          <p>No user with ID {id()}.</p>
        </div>
      }
    >
      {(u) => (
        <div>
          <h1>{u().name}</h1>
          <div class="card">
            <p>
              <strong>Role:</strong> {u().role}
            </p>
            <p>
              <strong>Email:</strong> {u().email}
            </p>
            <p>
              <strong>ID:</strong> {id()}
            </p>
          </div>
          <p>
            Notice that <strong>Users</strong> in the outer sidebar remains
            active (ancestor matching) while you browse profiles.
          </p>
        </div>
      )}
    </Show>
  );
}
