import { Link, RouteView, useRoute } from "@real-router/preact";

import { UserPosts } from "./UserPosts";

import type { UserProfileData } from "../router/loaders";
import type { JSX } from "preact";

export function UserProfile(): JSX.Element {
  const { route } = useRoute();
  const data = route.context.data as UserProfileData | undefined;

  if (!data?.user) {
    return (
      <div>
        <h1>User Profile</h1>
        <p data-testid="user-not-found">User not found.</p>
      </div>
    );
  }

  const { user } = data;

  return (
    <div data-testid="user-profile" data-user-id={user.id}>
      <h1>User Profile</h1>
      <p data-testid="user-name">Name: {user.name}</p>
      <p data-testid="user-id">ID: {user.id}</p>

      <Link
        routeName="users.profile.posts"
        routeParams={{ id: user.id }}
        data-testid="view-posts"
      >
        View posts
      </Link>

      <RouteView nodeName="users.profile">
        <RouteView.Match segment="posts">
          <UserPosts />
        </RouteView.Match>
      </RouteView>
    </div>
  );
}
