import { useRoute } from "@real-router/solid";
import { Show } from "solid-js";

import type { JSX } from "solid-js";

interface ProfileData {
  id: string;
  name: string;
}

export function UserProfile(): JSX.Element {
  const routeState = useRoute();
  const data = (): ProfileData | undefined =>
    routeState().route.context.data as ProfileData | undefined;

  return (
    <main data-testid="user-profile">
      <h1>User profile (data-only)</h1>
      <p data-testid="profile-shell">
        Server fetched the data and shipped JSON; this shell renders without
        SSR'd HTML, the client hydrates from{" "}
        <code>__SSR_STATE__.context.data</code>.
      </p>
      <Show when={data()}>
        {(d) => (
          <p data-testid="profile-data">
            {d().id} — {d().name}
          </p>
        )}
      </Show>
    </main>
  );
}
