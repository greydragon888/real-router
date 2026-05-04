import { Component, computed } from "@angular/core";
import { injectRoute } from "@real-router/angular";

import type { UserProfileData } from "../router/loaders";

@Component({
  selector: "user-profile-page",
  template: `
    @if (data()?.user; as user) {
      <div data-testid="user-profile" [attr.data-user-id]="user.id">
        <h2>User Profile</h2>
        <p data-testid="user-id">ID: {{ user.id }}</p>
        <p data-testid="user-name">Name: {{ user.name }}</p>
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
      this.route.routeState().route.context.data as
        | UserProfileData
        | undefined,
  );
}
