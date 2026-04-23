import { Component, computed } from "@angular/core";
import {
  injectRoute,
  injectRouteUtils,
  RealLink,
  RouteMatch,
  RouteView,
} from "@real-router/angular";

import { UserProfileComponent } from "./user-profile.component";
import { UserSettingsComponent } from "./user-settings.component";
import { UsersListComponent } from "./users-list.component";

import type { Params } from "@real-router/core";

const ROUTE_LABELS: Record<string, string> = {
  home: "Home",
  users: "Users",
  "users.list": "List",
  "users.settings": "Settings",
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
    RouteView,
    UsersListComponent,
    UserProfileComponent,
    UserSettingsComponent,
  ],
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

    <div style="display: flex; gap: 24px; margin-top: 16px;">
      <nav style="min-width: 140px;">
        <p
          style="font-size: 12px; text-transform: uppercase; color: #888; margin-bottom: 8px;"
        >
          Users
        </p>
        <a
          realLink
          routeName="users.list"
          activeClassName="active"
          style="display: block; padding: 6px 12px; text-decoration: none; color: #555; border-radius: 4px;"
        >
          List
        </a>
        <a
          realLink
          routeName="users.settings"
          activeClassName="active"
          style="display: block; padding: 6px 12px; text-decoration: none; color: #555; border-radius: 4px;"
        >
          Settings
        </a>
      </nav>

      <div style="flex: 1;">
        <route-view [routeNode]="'users'">
          <ng-template routeMatch="list"><users-list /></ng-template>
          <ng-template routeMatch="profile"><user-profile /></ng-template>
          <ng-template routeMatch="settings"><user-settings /></ng-template>
        </route-view>
      </div>
    </div>
  `,
})
export class UsersLayoutComponent {
  private readonly route = injectRoute();
  private readonly utils = injectRouteUtils();

  readonly crumbs = computed(() => {
    const current = this.route.routeState().route;
    if (!current) return null;
    const chain = this.utils.getChain(current.name) ?? [current.name];
    const names = ["home", ...chain];
    return names.map((name, i) => ({
      name,
      label: getLabel(name, current.params),
      isLast: i === names.length - 1,
    }));
  });
}
