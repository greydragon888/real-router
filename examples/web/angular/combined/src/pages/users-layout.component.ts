import { Component, computed } from "@angular/core";
import {
  injectRoute,
  injectRouteNode,
  injectRouteUtils,
  RealLink,
  RouteMatch,
  RouteSelf,
  RouteView,
} from "@real-router/angular";

import type { Params } from "@real-router/core";

const ROUTE_LABELS: Record<string, string> = {
  home: "Home",
  users: "Users",
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
  selector: "users-list-inner",
  imports: [RealLink],
  template: `
    <div>
      <h1>Users</h1>
      <div class="card">
        <a realLink routeName="users.profile" [routeParams]="{ id: '1' }">
          User #1 — Alice
        </a>
      </div>
      <div class="card">
        <a realLink routeName="users.profile" [routeParams]="{ id: '2' }">
          User #2 — Bob
        </a>
      </div>
      <div class="card">
        <a realLink routeName="users.profile" [routeParams]="{ id: '3' }">
          User #3 — Carol
        </a>
      </div>
    </div>
  `,
})
export class UsersListInnerComponent {}

@Component({
  selector: "user-profile-inner",
  imports: [RealLink],
  template: `
    <div>
      <h1>User #{{ id() }}</h1>
      <div class="card">
        <p>Profile for user {{ id() }}</p>
      </div>
      <a realLink routeName="users">← Back to list</a>
    </div>
  `,
})
export class UserProfileInnerComponent {
  private readonly node = injectRouteNode("users.profile");

  readonly id = computed(() => {
    const params = this.node.routeState().route?.params;
    const raw = params?.["id"];
    return typeof raw === "string" ? raw : "?";
  });
}

@Component({
  selector: "users-layout",
  imports: [
    RealLink,
    RouteMatch,
    RouteSelf,
    RouteView,
    UsersListInnerComponent,
    UserProfileInnerComponent,
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

    <div style="margin-top: 16px;">
      <route-view [routeNode]="'users'">
        <ng-template routeSelf><users-list-inner /></ng-template>
        <ng-template routeMatch="profile"><user-profile-inner /></ng-template>
      </route-view>
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
