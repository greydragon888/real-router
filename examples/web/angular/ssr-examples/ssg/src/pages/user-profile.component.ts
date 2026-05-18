import { Component, computed } from "@angular/core";
import {
  RealLink,
  RouteMatch,
  RouteView,
  injectRoute,
} from "@real-router/angular";

import { UserPostsComponent } from "./user-posts.component";

import type { UserProfileData } from "../router/loaders";

@Component({
  selector: "user-profile-page",
  imports: [RealLink, RouteView, RouteMatch, UserPostsComponent],
  template: `
    @if (data()?.user; as user) {
      <div data-testid="user-profile" [attr.data-user-id]="user.id">
        <h2>User Profile</h2>
        <p data-testid="user-id">ID: {{ user.id }}</p>
        <p data-testid="user-name">Name: {{ user.name }}</p>

        <a
          realLink
          routeName="users.profile.posts"
          [routeParams]="{ id: user.id }"
          data-testid="view-posts"
        >
          View posts
        </a>

        <route-view [routeNode]="'users.profile'">
          <ng-template routeMatch="posts">
            <user-posts-page />
          </ng-template>
        </route-view>
      </div>
    } @else {
      <div>
        <h2>User Profile</h2>
        <p data-testid="user-not-found">User not found.</p>
      </div>
    }
  `,
})
export class UserProfileComponent {
  private readonly route = injectRoute();

  readonly data = computed<UserProfileData | undefined>(
    () =>
      this.route.routeState().route.context.data as UserProfileData | undefined,
  );
}
