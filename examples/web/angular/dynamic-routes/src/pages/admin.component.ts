import { Component } from "@angular/core";
import { RouteMatch, RouteNotFound, RouteView } from "@real-router/angular";

import { AdminSettingsComponent } from "./admin-settings.component";
import { AdminUsersComponent } from "./admin-users.component";

@Component({
  selector: "admin-page",
  imports: [
    RouteView,
    RouteMatch,
    RouteNotFound,
    AdminUsersComponent,
    AdminSettingsComponent,
  ],
  template: `
    <div>
      <h1>Admin</h1>
      <route-view [routeNode]="'admin'">
        <ng-template routeMatch="users"><admin-users /></ng-template>
        <ng-template routeMatch="settings"><admin-settings /></ng-template>
        <ng-template routeNotFound>
          <p>
            Use the sidebar links to navigate to Admin Users or Admin Settings.
          </p>
        </ng-template>
      </route-view>
    </div>
  `,
})
export class AdminComponent {}
