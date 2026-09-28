import { Component } from "@angular/core";
import { RealLink, RouteMatch, RouteView } from "@real-router/angular";

import { LevelComponent } from "./level.component";
import { DEEP_TARGETS, deepName } from "./routes";

// Precompute the home-page nav links (one per sweep target depth).
const DEEP_LINKS = DEEP_TARGETS.map((d) => ({
  d,
  name: deepName(d),
  testid: `link-deep-${d}`,
}));

@Component({
  selector: "app-root",
  imports: [RealLink, RouteMatch, RouteView, LevelComponent],
  template: `
    <route-view [routeNode]="''">
      <ng-template routeMatch="home">
        <nav>
          @for (l of links; track l.d) {
            <a realLink [routeName]="l.name" [attr.data-testid]="l.testid"
              >Depth {{ l.d }}</a
            >
          }
        </nav>
      </ng-template>
      <ng-template routeMatch="deep">
        <route-view [routeNode]="'deep'">
          <ng-template routeMatch="l1">
            <app-level [k]="1" name="deep.l1" />
          </ng-template>
        </route-view>
      </ng-template>
    </route-view>
  `,
})
export class AppComponent {
  readonly links = DEEP_LINKS;
}
