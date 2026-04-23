import { Component } from "@angular/core";
import { RouteMatch, RouteNotFound, RouteView } from "@real-router/angular";

import { HomeComponent } from "./pages/home.component";
import { UsersLayoutComponent } from "./pages/users-layout.component";
import { Layout } from "../../shared/Layout";

const LINKS = [
  { routeName: "home", label: "Home" },
  { routeName: "users", label: "Users" },
];

@Component({
  selector: "app-root",
  imports: [
    Layout,
    RouteView,
    RouteMatch,
    RouteNotFound,
    HomeComponent,
    UsersLayoutComponent,
  ],
  template: `
    <app-layout title="Real-Router — Nested Routes" [links]="links">
      <route-view [routeNode]="''">
        <ng-template routeMatch="home"><home-page /></ng-template>
        <ng-template routeMatch="users"><users-layout /></ng-template>
        <ng-template routeNotFound>
          <h1>404 — Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
        </ng-template>
      </route-view>
    </app-layout>
  `,
})
export class AppComponent {
  readonly links = LINKS;
}
