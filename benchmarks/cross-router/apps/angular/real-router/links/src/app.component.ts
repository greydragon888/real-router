import { Component, computed } from "@angular/core";
import { injectRoute, RealLink } from "@real-router/angular";

import { tabs } from "./routes";

// 100 active-aware <a realLink activeClassName> to sibling /tab/i routes. Each
// RealLink subscribes to active state → navigation recomputes active across all
// 100 (cached createActiveRouteSource per link).
@Component({
  selector: "links-content",
  template: `
    @if (n()) {
      <main data-testid="page-tab" [attr.data-n]="n()"><h1>Tab {{ n() }}</h1></main>
    } @else {
      <main data-testid="page-home"><h1>Home</h1></main>
    }
  `,
})
export class LinksContentComponent {
  private readonly route = injectRoute();
  readonly name = computed(() => this.route.routeState().route.name);
  readonly n = computed(() =>
    this.name().startsWith("tab") ? this.name().slice(3) : "",
  );
}

@Component({
  selector: "app-root",
  imports: [RealLink, LinksContentComponent],
  template: `
    <nav>
      @for (i of tabs; track i) {
        <a
          realLink
          [routeName]="'tab' + i"
          activeClassName="active"
          [attr.data-testid]="'link-tab-' + i"
          >Tab {{ i }}</a
        >
      }
    </nav>
    <links-content />
  `,
})
export class AppComponent {
  readonly tabs = tabs;
}
