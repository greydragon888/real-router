import { useRoute } from "@real-router/solid";
import { Show } from "solid-js";

import type { UserProfileData } from "../router/loaders";
import type { JSX } from "solid-js";

export function UserProfile(): JSX.Element {
  const routeState = useRoute();
  const data = (): UserProfileData | undefined =>
    routeState().route.context.data as UserProfileData | undefined;

  return (
    <Show
      when={data()?.user}
      fallback={
        <div>
          <h2>User Profile</h2>
          <p>User not found.</p>
        </div>
      }
    >
      {(user) => (
        <div>
          <h2>User Profile</h2>
          <p>ID: {user().id}</p>
          <p>Name: {user().name}</p>
        </div>
      )}
    </Show>
  );
}
