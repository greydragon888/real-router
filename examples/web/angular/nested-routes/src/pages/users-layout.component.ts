import { Component, computed } from "@angular/core";
import {
  injectRoute,
  injectRouteUtils,
  RealLink,
  RouteMatch,
  RouteSelf,
  RouteView,
} from "@real-router/angular";

import { UserProfileComponent } from "./user-profile.component";
import { UsersListComponent } from "./users-list.component";

import type { Params } from "@real-router/core";

const ROUTE_LABELS: Record<string, string> = {
  home: "Home",
  users: "Users",
  "users.profile.settings": "Settings",
};

function getLabel(name: string, params: Params): string {
  if (name in ROUTE_LABELS) {
    return ROUTE_LABELS[name] ?? name;
  }
  if (name === "users.profile") {
    const id = typeof params["id"] === "string" ? params["id"] : "?";
    return `User #${id}`;
  }
  return name;
}

@Component({
  selector: "users-layout",
  imports: [
    RealLink,
    RouteMatch,
    RouteSelf,
    RouteView,
    UsersListComponent,
    UserProfileComponent,
  ],
  // `users` IS the list — no synthetic `list` child / forwardTo. routeSelf
  // template renders UsersList when active is exactly `users`; routeMatch
  // "profile" wins for /users/:id and deeper (UserProfile owns its own
  // sub-navigation between profile-info and per-user Settings).
  template: `
    @if (crumbs(); as list) {
      <nav class="breadcrumbs" aria-label="breadcrumb">
        @for (crumb of list; track crumb.name; let i = $index) {
          @if (i > 0) {
            <span> › </span>
          }
          @if (crumb.isLast) {
            <span>{{ crumb.label }}</span>
          } @else {
            <a realLink [routeName]="crumb.name">{{ crumb.label }}</a>
          }
        }
      </nav>
    }

    <div style="margin-top: 16px;">
      <route-view [routeNode]="'users'">
        <ng-template routeSelf><users-list /></ng-template>
        <ng-template routeMatch="profile"><user-profile /></ng-template>
      </route-view>
    </div>
  `,
})
export class UsersLayoutComponent {
  private readonly route = injectRoute();
  private readonly utils = injectRouteUtils();

  readonly crumbs = computed(() => {
    const current = this.route.routeState().route;
    const chain = this.utils.getChain(current.name) ?? [current.name];
    const names = ["home", ...chain];
    return names.map((name, i) => ({
      name,
      label: getLabel(name, current.params),
      isLast: i === names.length - 1,
    }));
  });
}
