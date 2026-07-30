import { Component, computed } from "@angular/core";
import { injectRoute, RealLink } from "@real-router/angular";

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
    <div data-route-root data-route-anim="fade">
      <h1>Query-only navigation</h1>
      <p>
        Changing the filter via query params is a same-route navigation (<code
          >route.name === nextRoute.name</code
        >). <code>injectRouteExit</code> detects this via its default
        <code>skipSameRoute: true</code> and skips the page-level fade entirely
        — the page does not animate. <code>installListFlip</code> opts in via
        <code>skipSameRoute: false</code> to own the same-route window: items
        glide between positions, newcomers fade in, removed items fade out via
        ghost clones.
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

      <ul class="qd-list">
        @for (item of visible(); track item.id) {
          <li class="qd-item" [attr.data-flip-key]="item.id">
            <strong>{{ item.label }}</strong>
            <span> — {{ item.category }}</span>
          </li>
        }
      </ul>
    </div>
  `,
})
export class QueryDemoComponent {
  private readonly state = injectRoute();

  readonly filters = FILTERS;

  readonly filter = computed<Filter>(
    () => (this.state.routeState().route.search.filter as Filter) ?? "all",
  );

  readonly visible = computed(() => {
    const f = this.filter();

    return f === "all" ? ITEMS : ITEMS.filter((item) => item.category === f);
  });
}
