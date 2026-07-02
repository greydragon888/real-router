import { Component } from "@angular/core";
import {
  RealLink,
  RouteMatch,
  RouteNotFound,
  RouteView,
} from "@real-router/angular";

import { AboutComponent } from "./pages/about.component";
import { HomeComponent } from "./pages/home.component";
import { UserComponent } from "./pages/user.component";

@Component({
  selector: "app-root",
  imports: [
    RealLink,
    RouteView,
    RouteMatch,
    RouteNotFound,
    HomeComponent,
    AboutComponent,
    UserComponent,
  ],
  template: `
    <nav>
      <a realLink routeName="home" data-testid="link-home">Home</a>
      <a realLink routeName="about" data-testid="link-about">About</a>
    </nav>
    <route-view [routeNode]="''">
      <ng-template routeMatch="home"><home-page /></ng-template>
      <ng-template routeMatch="about"><about-page /></ng-template>
      <ng-template routeMatch="user"><user-page /></ng-template>
    </route-view>
  `,
})
export class AppComponent {}
