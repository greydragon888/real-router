import { useRoute } from "@real-router/react";

import type { UserProfileData } from "../router/loaders";
import type { JSX } from "react";

export function UserProfile(): JSX.Element {
  const { route } = useRoute();
  const data = route.context.data as UserProfileData | undefined;

  if (!data?.user) {
    return (
      <div>
        <h2>User Profile</h2>
        <p data-testid="user-not-found">User not found.</p>
      </div>
    );
  }

  const { user } = data;

  return (
    <div data-testid="user-profile" data-user-id={user.id}>
      <h2>User Profile</h2>
      <p data-testid="user-id">ID: {user.id}</p>
      <p data-testid="user-name">Name: {user.name}</p>
    </div>
  );
}
