import {
  Component,
  computed,
  ElementRef,
  inject,
  viewChild,
} from "@angular/core";
import { injectRoute, RealLink } from "@real-router/angular";

import { installListFlip } from "../list-flip";
import { installRouteAnimation } from "../route-animation";

const ITEMS = [
  { id: "alpha", label: "Alpha", category: "letter" },
  { id: "bravo", label: "Bravo", category: "letter" },
  { id: "one", label: "One", category: "number" },
  { id: "two", label: "Two", category: "number" },
  { id: "red", label: "Red", category: "color" },
  { id: "blue", label: "Blue", category: "color" },
];

type Filter = "all" | "letter" | "number" | "color";
const FILTERS: Filter[] = ["all", "letter", "number", "color"];

@Component({
  selector: "query-demo-page",
  imports: [RealLink],
  template: `
    <h1>Query-only navigation</h1>
    <p>
      Click a filter — the page itself does not fade because the factory's
      default <code>skipSameRoute: true</code> short-circuits when
      <code>route.name === nextRoute.name</code>. Three coordinated WAAPI
      animations play instead, all driven by <code>installListFlip</code>:
      survivors translate from old to new positions (inverse-FLIP from a
      <code>getBoundingClientRect</code> diff in <code>effect()</code>);
      newly-visible items fade in; items removed by a narrowing filter fade out
      via cloned ghosts reconstructed from <code>outerHTML</code> and pinned at
      their last-known rect. View-local — no router events, no shared state
      between components.
    </p>

    <div class="qd-toolbar">
      @for (value of filters; track value) {
        <a
          realLink
          routeName="queryDemo"
          [routeSearch]="{ filter: value }"
          [ignoreQueryParams]="false"
        >
          {{ value }}
        </a>
      }
    </div>

    <ul #list class="qd-list">
      @for (item of visible(); track item.id) {
        <li class="qd-item" [attr.data-flip-key]="item.id">
          <strong>{{ item.label }}</strong>
          <span> — {{ item.category }}</span>
        </li>
      }
    </ul>
  `,
})
export class QueryDemoComponent {
  private readonly state = injectRoute();

  readonly filters = FILTERS;

  readonly list = viewChild<ElementRef<HTMLUListElement>>("list");

  readonly filter = computed<Filter>(
    () => (this.state.routeState().route.search.filter as Filter) ?? "all",
  );

  readonly visible = computed(() => {
    const f = this.filter();

    return f === "all" ? ITEMS : ITEMS.filter((item) => item.category === f);
  });

  constructor() {
    const hostRef = inject(ElementRef<HTMLElement>);

    installRouteAnimation(hostRef, {
      entryClass: "fade-in",
      exitClass: "fade-out",
    });
    installListFlip(this.list);
  }
}
