import { Component, input } from "@angular/core";
import {
  RealLink,
  RouteMatch,
  RouteView,
} from "@real-router/angular";

@Component({
  selector: "sec-leaf",
  template: `<main data-testid="page-item" [attr.data-n]="n()">
    <h1>{{ n() }}</h1>
  </main>`,
})
export class LeafComponent {
  readonly n = input<string>("");
}

// The shared layout: its own <route-view [routeNode]="'sec'"> is isolated from
// the parent route-view by this component boundary. Switching a↔b keeps
// SectionLayout mounted (route-view reuses the parent); only the inner leaf swaps.
@Component({
  selector: "section-layout",
  imports: [RealLink, RouteMatch, RouteView, LeafComponent],
  template: `
    <div class="sec">
      <nav>
        <a realLink routeName="sec.a" data-testid="link-sec-a">A</a>
        <a realLink routeName="sec.b" data-testid="link-sec-b">B</a>
      </nav>
      <route-view [routeNode]="'sec'">
        <ng-template routeMatch="a"><sec-leaf n="a" /></ng-template>
        <ng-template routeMatch="b"><sec-leaf n="b" /></ng-template>
      </route-view>
    </div>
  `,
})
export class SectionLayoutComponent {}

@Component({
  selector: "app-root",
  imports: [RouteMatch, RouteView, SectionLayoutComponent],
  template: `
    <route-view [routeNode]="''">
      <ng-template routeMatch="home">
        <main data-testid="page-home"><h1>Home</h1></main>
      </ng-template>
      <ng-template routeMatch="sec"><section-layout /></ng-template>
    </route-view>
  `,
})
export class AppComponent {}
