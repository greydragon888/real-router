import { Component, computed } from "@angular/core";
import {
  injectRouteNode,
  RealLink,
  RouteMatch,
  RouteSelf,
  RouteView,
} from "@real-router/angular";

import { UserSettingsComponent } from "./user-settings.component";

const USER_DATA: Record<string, { name: string; role: string; email: string }> =
  {
    "1": { name: "Alice", role: "Admin", email: "alice@example.com" },
    "2": { name: "Bob", role: "Editor", email: "bob@example.com" },
    "3": { name: "Carol", role: "Viewer", email: "carol@example.com" },
  };

@Component({
  selector: "user-profile",
  imports: [RealLink, RouteMatch, RouteSelf, RouteView, UserSettingsComponent],
  // `users.profile` IS the profile-info page — no synthetic child for it.
  // routeSelf template renders profile details when active is exactly
  // `users.profile`; routeMatch "settings" wins for /users/:id/settings.
  template: `
    <h1>{{ displayName() }}</h1>

    <div style="display: flex; gap: 24px; margin-top: 16px;">
      <nav style="min-width: 140px;">
        <p
          style="font-size: 12px; text-transform: uppercase; color: #888; margin-bottom: 8px;"
        >
          {{ displayName() }}
        </p>
        <a
          realLink
          routeName="users.profile"
          [routeParams]="{ id: id() }"
          [activeStrict]="true"
          activeClassName="active"
          style="display: block; padding: 6px 12px; text-decoration: none; color: #555; border-radius: 4px;"
        >
          Profile
        </a>
        <a
          realLink
          routeName="users.profile.settings"
          [routeParams]="{ id: id() }"
          activeClassName="active"
          style="display: block; padding: 6px 12px; text-decoration: none; color: #555; border-radius: 4px;"
        >
          Settings
        </a>
      </nav>

      <div style="flex: 1;">
        <route-view [routeNode]="'users.profile'">
          <ng-template routeSelf>
            @if (user(); as u) {
              <div class="card">
                <p><strong>Role:</strong> {{ u.role }}</p>
                <p><strong>Email:</strong> {{ u.email }}</p>
                <p><strong>ID:</strong> {{ id() }}</p>
              </div>
            } @else {
              <div>
                <h2>User Not Found</h2>
                <p>No user with ID {{ id() }}.</p>
              </div>
            }
          </ng-template>
          <ng-template routeMatch="settings"><user-settings /></ng-template>
        </route-view>
      </div>
    </div>
  `,
})
export class UserProfileComponent {
  private readonly node = injectRouteNode("users.profile");

  readonly id = computed(() => {
    const params = this.node.routeState().route?.params;
    const raw = params?.id;

    return typeof raw === "string" ? raw : "";
  });

  readonly user = computed(() => {
    const id = this.id();

    return id ? USER_DATA[id] : undefined;
  });

  readonly displayName = computed(
    () => this.user()?.name ?? `User ${this.id() || "?"}`,
  );
}
