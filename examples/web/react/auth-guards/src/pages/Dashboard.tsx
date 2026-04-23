import { useSyncExternalStore } from "react";

import { store } from "../../../../shared/store";

import type { User } from "../../../../shared/api";
import type { JSX } from "react";

interface DashboardProps {
  readonly onLogout: () => Promise<void>;
}

export function Dashboard({ onLogout }: DashboardProps): JSX.Element {
  const user = useSyncExternalStore(
    store.subscribe,
    () => store.get("user") as User | null,
  );

  return (
    <div>
      <h1>Dashboard</h1>
      {user && (
        <div className="card">
          <p>
            <strong>Logged in as:</strong> {user.name}
          </p>
          <p>
            <strong>Role:</strong> {user.role}
          </p>
          <p>
            <strong>Email:</strong> {user.email}
          </p>
        </div>
      )}
      <p>
        The route tree was atomically replaced on login:{" "}
        <code>routesApi.clear() + routesApi.add(privateRoutes)</code>
      </p>
      <button
        className="danger"
        onClick={() => void onLogout()}
        style={{ marginTop: "16px" }}
      >
        Logout
      </button>
    </div>
  );
}
