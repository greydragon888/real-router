import { Component } from "@angular/core";
import { RouteMatch, RouteNotFound, RouteView } from "@real-router/angular";

import { AboutComponent } from "./pages/about.component";
import { ContactsComponent } from "./pages/contacts.component";
import { HomeComponent } from "./pages/home.component";
import { ParamsToolbarComponent } from "./params-toolbar.component";
import { Layout } from "../../shared/Layout";

const LINKS = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "contacts", label: "Contacts" },
];

@Component({
  selector: "app-root",
  imports: [
    Layout,
    ParamsToolbarComponent,
    RouteView,
    RouteMatch,
    RouteNotFound,
    HomeComponent,
    AboutComponent,
    ContactsComponent,
  ],
  template: `
    <app-layout title="Real-Router — Persistent Params" [links]="links">
      <params-toolbar />
      <route-view [routeNode]="''">
        <ng-template routeMatch="home"><home-page /></ng-template>
        <ng-template routeMatch="about"><about-page /></ng-template>
        <ng-template routeMatch="contacts"><contacts-page /></ng-template>
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
