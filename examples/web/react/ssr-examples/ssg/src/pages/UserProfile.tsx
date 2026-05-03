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
        <p>User not found.</p>
      </div>
    );
  }

  const { user } = data;

  return (
    <div>
      <h2>User Profile</h2>
      <p>ID: {user.id}</p>
      <p>Name: {user.name}</p>
    </div>
  );
}
