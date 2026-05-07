import { useRoute } from "@real-router/react";
export function UserProfile() {
    const { route } = useRoute();
    const data = route.context.data;
    return (<main data-testid="user-profile">
      <h1>User profile (data-only)</h1>
      <p data-testid="profile-shell">
        Server fetched the data and shipped JSON; this shell renders without
        SSR'd HTML, the client hydrates from{" "}
        <code>__SSR_STATE__.context.data</code>.
      </p>
      {data !== undefined && (<p data-testid="profile-data">
          {data.id} — {data.name}
        </p>)}
    </main>);
}
