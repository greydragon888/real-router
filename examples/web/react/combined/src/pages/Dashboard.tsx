import { useNavigator, useRoute } from "@real-router/react";
import { useSyncExternalStore } from "react";

import { store } from "../../../../shared/store";

import type { User } from "../../../../shared/api";
import type { JSX } from "react";

interface DashboardProps {
  readonly onLogout: () => Promise<void>;
}

export default function Dashboard({ onLogout }: DashboardProps): JSX.Element {
  const user = useSyncExternalStore(
    store.subscribe,
    () => store.get("user") as User | null,
  );
  const { route } = useRoute();
  const navigator = useNavigator();

  const lang = (route?.params.lang as string | undefined) ?? "en";

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
            <strong>Lang param:</strong> {lang}
          </p>
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginTop: "16px",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() =>
            void navigator.navigate(
              route?.name ?? "dashboard",
              {
                ...route?.params,
                lang: lang === "en" ? "ru" : "en",
              },
              { reload: true },
            )
          }
        >
          Toggle lang ({lang === "en" ? "→ RU" : "→ EN"})
        </button>
        <button className="danger" onClick={() => void onLogout()}>
          Logout
        </button>
      </div>
      <p style={{ marginTop: "16px", fontSize: "14px", color: "#888" }}>
        This page loads lazily — chunk loaded on first visit.
      </p>
    </div>
  );
}
