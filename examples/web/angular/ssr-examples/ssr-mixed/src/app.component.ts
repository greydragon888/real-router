import { Component } from "@angular/core";
import {
  RealLink,
  RouteMatch,
  RouteNotFound,
  RouteView,
} from "@real-router/angular";

import { AdminComponent } from "./pages/admin.component";
import { DocComponent } from "./pages/doc.component";
import { HomeComponent } from "./pages/home.component";
import { NotFoundComponent } from "./pages/not-found.component";
import { UserProfileComponent } from "./pages/user-profile.component";

@Component({
  selector: "app-root",
  imports: [
    RealLink,
    RouteView,
    RouteMatch,
    RouteNotFound,
    HomeComponent,
    AdminComponent,
    DocComponent,
    NotFoundComponent,
    UserProfileComponent,
  ],
  template: `
    <div>
      <nav>
        <a realLink routeName="home">Home</a>
        {{ " | " }}
        <a realLink routeName="admin.dashboard">Admin (client-only)</a>
        {{ " | " }}
        <a realLink routeName="users.profile" [routeParams]="{ id: '42' }">
          User 42 (data-only)
        </a>
        {{ " | " }}
        <a realLink routeName="docs.detail" [routeParams]="{ id: 'guide' }">
          Doc HTML
        </a>
        {{ " | " }}
        <a
          realLink
          routeName="docs.detail"
          [routeParams]="{ id: 'guide' }"
          [routeSearch]="{ format: 'pdf' }"
        >
          Doc PDF (client-only)
        </a>
      </nav>
      <hr />
      <route-view [routeNode]="''">
        <ng-template routeMatch="home"><home-page /></ng-template>
        <ng-template routeMatch="admin">
          <route-view [routeNode]="'admin'">
            <ng-template routeMatch="dashboard"><admin-page /></ng-template>
          </route-view>
        </ng-template>
        <ng-template routeMatch="users">
          <route-view [routeNode]="'users'">
            <ng-template routeMatch="profile"><user-profile-page /></ng-template>
          </route-view>
        </ng-template>
        <ng-template routeMatch="docs">
          <route-view [routeNode]="'docs'">
            <ng-template routeMatch="detail"><doc-page /></ng-template>
          </route-view>
        </ng-template>
        <ng-template routeNotFound><not-found-page /></ng-template>
      </route-view>
    </div>
  `,
})
export class AppComponent {}
