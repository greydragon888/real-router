import { Component } from "@angular/core";
import {
  RealLink,
  RouteMatch,
  RouteNotFound,
  RouteSelf,
  RouteView,
} from "@real-router/angular";

import { AdminComponent } from "./pages/admin.component";
import { DashboardComponent } from "./pages/dashboard.component";
import { HomeComponent } from "./pages/home.component";
import { NotFoundComponent } from "./pages/not-found.component";
import { UserProfileComponent } from "./pages/user-profile.component";
import { UsersListComponent } from "./pages/users-list.component";

@Component({
  selector: "app-root",
  imports: [
    RealLink,
    RouteView,
    RouteMatch,
    RouteNotFound,
    RouteSelf,
    HomeComponent,
    UsersListComponent,
    UserProfileComponent,
    DashboardComponent,
    AdminComponent,
    NotFoundComponent,
  ],
  template: `
    <div>
      <nav>
        <a realLink routeName="home">Home</a>
        {{ " | " }}
        <a realLink routeName="users">Users</a>
        {{ " | " }}
        <a realLink routeName="dashboard">Dashboard</a>
        {{ " | " }}
        <a realLink routeName="admin" data-testid="nav-admin">Admin</a>
      </nav>
      <main>
        <route-view [routeNode]="''">
          <ng-template routeMatch="home"><home-page /></ng-template>
          <ng-template routeMatch="users">
            <h1>Users</h1>
            <route-view [routeNode]="'users'">
              <ng-template routeSelf><users-list-page /></ng-template>
              <ng-template routeMatch="profile">
                <user-profile-page />
              </ng-template>
            </route-view>
          </ng-template>
          <ng-template routeMatch="dashboard">
            <dashboard-page />
          </ng-template>
          <ng-template routeMatch="admin">
            <admin-page />
          </ng-template>
          <ng-template routeNotFound>
            <not-found-page />
          </ng-template>
        </route-view>
      </main>
    </div>
  `,
})
export class AppComponent {}
