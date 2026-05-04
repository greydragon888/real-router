import { Link, RouteView, useRoute } from "@real-router/solid";
import { Show } from "solid-js";

import { UserPosts } from "./UserPosts";

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
          <p data-testid="user-not-found">User not found.</p>
        </div>
      }
    >
      {(user) => (
        <div data-testid="user-profile" data-user-id={user().id}>
          <h2>User Profile</h2>
          <p data-testid="user-id">ID: {user().id}</p>
          <p data-testid="user-name">Name: {user().name}</p>

          <Link
            routeName="users.profile.posts"
            routeParams={{ id: user().id }}
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
      )}
    </Show>
  );
}
