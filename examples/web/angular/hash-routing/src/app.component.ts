import { Component } from "@angular/core";
import { RouteMatch, RouteNotFound, RouteView } from "@real-router/angular";

import { DashboardComponent } from "./pages/dashboard.component";
import { HomeComponent } from "./pages/home.component";
import { SettingsComponent } from "./pages/settings.component";
import { Layout } from "../../shared/Layout";

const LINKS = [
  { routeName: "home", label: "Home" },
  { routeName: "dashboard", label: "Dashboard" },
  { routeName: "settings", label: "Settings" },
];

@Component({
  selector: "app-root",
  imports: [
    Layout,
    RouteView,
    RouteMatch,
    RouteNotFound,
    HomeComponent,
    DashboardComponent,
    SettingsComponent,
  ],
  template: `
    <app-layout title="Real-Router — Hash Routing" [links]="links">
      <route-view [routeNode]="''">
        <ng-template routeMatch="home"><home-page /></ng-template>
        <ng-template routeMatch="dashboard"><dashboard-page /></ng-template>
        <ng-template routeMatch="settings"><settings-page /></ng-template>
        <ng-template routeNotFound>
          <h1>404 — Page Not Found</h1>
        </ng-template>
      </route-view>
    </app-layout>
  `,
})
export class AppComponent {
  readonly links = LINKS;
}
