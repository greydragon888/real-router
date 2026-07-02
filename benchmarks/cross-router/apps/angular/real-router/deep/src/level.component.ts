import { Component, computed, input } from "@angular/core";
import { RouteMatch, RouteSelf, RouteView } from "@real-router/angular";

import { CatalogItemComponent } from "./catalog-item.component";

// Recursive nested layout, one per depth level. `routeSelf` renders the leaf
// when this node is the terminal route; `routeMatch="l{k+1}"` descends to the
// next level via a self-reference (`LevelComponent` in `imports`). The deeper
// <app-level> is only instantiated when its RouteMatch template is stamped
// (lazy outlet), so recursion terminates naturally at the active depth — the
// `l{k+1}` match at the deepest level never activates because no route reaches
// it (routes only go to l{DEEP_DEPTH}). The RouteMatch is always rendered (not
// wrapped in @if) to mirror the base app's proven contentChildren pattern.
//
// The component boundary isolates each <route-view>'s contentChildren from its
// ancestors (proven by examples/web/angular/nested-routes/users-layout).
@Component({
  selector: "app-level",
  imports: [RouteView, RouteMatch, RouteSelf, CatalogItemComponent, LevelComponent],
  template: `
    <div class="lvl">
      <route-view [routeNode]="name()">
        <ng-template routeSelf><catalog-item [n]="kStr()" /></ng-template>
        <ng-template [routeMatch]="nextSeg()">
          <app-level [k]="nextK()" [name]="nextName()" />
        </ng-template>
      </route-view>
    </div>
  `,
})
export class LevelComponent {
  readonly k = input.required<number>();
  readonly name = input.required<string>();

  readonly kStr = computed(() => String(this.k()));
  readonly nextK = computed(() => this.k() + 1);
  readonly nextSeg = computed(() => `l${this.k() + 1}`);
  readonly nextName = computed(() => `${this.name()}.l${this.k() + 1}`);
}
