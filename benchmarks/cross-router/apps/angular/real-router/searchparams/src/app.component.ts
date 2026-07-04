import { Component, computed } from "@angular/core";
import { injectRoute, RealLink } from "@real-router/angular";

import { SEARCH_COUNTS, searchValues, readSearch } from "./routes";

// Precompute stable nav-link descriptors (stable `params` object per link so
// RealLink's active-route source key does not churn).
const SEARCH_LINKS = SEARCH_COUNTS.map((n) => ({
  n,
  routeName: `s${n}`,
  testid: `link-search-${n}`,
  params: searchValues(n),
}));

// real-router declares query params in the route path (`?k1&k2&…`) and merges them
// into `route.params`, parsed EAGERLY by the matcher (search-params). The leaf reads
// EVERY value (readSearch → checksum) reactively per navigation via the route signal
// — a single constant-size line, not N DOM nodes.
@Component({
  selector: "search-content",
  template: `
    @if (isSearch()) {
      <main data-testid="page-search" [attr.data-count]="count()">
        {{ count() }} search · Σ{{ checksum() }}
      </main>
    } @else {
      <main data-testid="page-home"><h1>Home</h1></main>
    }
  `,
})
export class SearchContentComponent {
  private readonly route = injectRoute();
  readonly name = computed(() => this.route.routeState().route.name);
  readonly isSearch = computed(() => /^s\d+$/.test(this.name()));
  private readonly result = computed(() =>
    readSearch(Object.entries(this.route.routeState().route.params)),
  );
  readonly count = computed(() => this.result().count);
  readonly checksum = computed(() => this.result().checksum);
}

@Component({
  selector: "app-root",
  imports: [RealLink, SearchContentComponent],
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
    <search-content />
  `,
})
export class AppComponent {
  readonly links = SEARCH_LINKS;
}
