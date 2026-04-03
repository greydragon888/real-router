import { createEffect, createSignal, onCleanup, Show } from "solid-js";

import { store } from "../../../../shared/store";

import type { User } from "../../../../shared/api";
import type { JSX } from "solid-js";

interface DashboardProps {
  readonly onLogout: () => Promise<void>;
}

export function Dashboard(props: DashboardProps): JSX.Element {
  const [user, setUser] = createSignal<User | null>(
    store.get("user") as User | null,
  );

  createEffect(() => {
    const unsub = store.subscribe(() =>
      setUser(store.get("user") as User | null),
    );

    onCleanup(unsub);
  });

  return (
    <div>
      <h1>Dashboard</h1>
      <Show when={user()}>
        {(u) => (
          <div class="card">
            <p>
              <strong>Logged in as:</strong> {u().name}
            </p>
            <p>
              <strong>Role:</strong> {u().role}
            </p>
            <p>
              <strong>Email:</strong> {u().email}
            </p>
          </div>
        )}
      </Show>
      <p>
        The route tree was atomically replaced on login:{" "}
        <code>routesApi.clear() + routesApi.add(privateRoutes)</code>
      </p>
      <button
        class="danger"
        onClick={() => void props.onLogout()}
        style={{ "margin-top": "16px" }}
      >
        Logout
      </button>
    </div>
  );
}
