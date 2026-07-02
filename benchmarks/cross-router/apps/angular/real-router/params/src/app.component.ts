import { Component, computed } from "@angular/core";
import { injectRoute, RealLink } from "@real-router/angular";

import { PARAM_COUNTS, paramValues } from "./routes";

// Precompute stable nav-link descriptors (stable `params` object per link so
// RealLink's active-route source key does not churn).
const PARAM_LINKS = PARAM_COUNTS.map((n) => ({
  n,
  routeName: `p${n}`,
  testid: `link-param-${n}`,
  params: paramValues(n),
}));

// The matcher (segment trie) collects params during the walk; the leaf reports
// how many `kN` params it extracted (data-count) so the driver confirms arrival.
@Component({
  selector: "param-content",
  template: `
    @if (isParam()) {
      <main data-testid="page-param" [attr.data-count]="count()">
        {{ count() }} params
      </main>
    } @else {
      <main data-testid="page-home"><h1>Home</h1></main>
    }
  `,
})
export class ParamContentComponent {
  private readonly route = injectRoute();
  readonly name = computed(() => this.route.routeState().route.name);
  readonly isParam = computed(() => /^p\d+$/.test(this.name()));
  readonly count = computed(
    () =>
      Object.keys(this.route.routeState().route.params).filter((k) =>
        /^k\d+$/.test(k),
      ).length,
  );
}

@Component({
  selector: "app-root",
  imports: [RealLink, ParamContentComponent],
  template: `
    <nav>
      @for (l of links; track l.n) {
        <a
          realLink
          [routeName]="l.routeName"
          [routeParams]="l.params"
          [attr.data-testid]="l.testid"
          >{{ l.n }}</a
        >
      }
    </nav>
    <param-content />
  `,
})
export class AppComponent {
  readonly links = PARAM_LINKS;
}
