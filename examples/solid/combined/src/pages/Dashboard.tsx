import { useNavigator, useRoute } from "@real-router/solid";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";

import { store } from "../../../../shared/store";

import type { User } from "../../../../shared/api";
import type { JSX } from "solid-js";

interface DashboardProps {
  readonly onLogout: () => Promise<void>;
}

export default function Dashboard(props: DashboardProps): JSX.Element {
  const [user, setUser] = createSignal<User | null>(
    store.get("user") as User | null,
  );
  const routeState = useRoute();
  const navigator = useNavigator();

  createEffect(() => {
    const unsub = store.subscribe(() =>
      setUser(store.get("user") as User | null),
    );
    onCleanup(unsub);
  });

  const lang = () => (routeState().route?.params.lang as string | undefined) ?? "en";

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
              <strong>Lang param:</strong> {lang()}
            </p>
          </div>
        )}
      </Show>
      <div
        style={{
          display: "flex",
          gap: "8px",
          "margin-top": "16px",
          "flex-wrap": "wrap",
        }}
      >
        <button
          onClick={() =>
            void navigator.navigate(
              routeState().route?.name ?? "dashboard",
              {
                ...routeState().route?.params,
                lang: lang() === "en" ? "ru" : "en",
              },
              { reload: true },
            )
          }
        >
          Toggle lang ({lang() === "en" ? "→ RU" : "→ EN"})
        </button>
        <button class="danger" onClick={() => void props.onLogout()}>
          Logout
        </button>
      </div>
      <p style={{ "margin-top": "16px", "font-size": "14px", color: "#888" }}>
        This page loads lazily — chunk loaded on first visit.
      </p>
    </div>
  );
}
