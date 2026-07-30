import { Component, computed } from "@angular/core";
import { injectRoute, RealLink } from "@real-router/angular";

interface Item {
  id: string;
  label: string;
  category: string;
}

const ITEMS: Item[] = [
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
  // injectRoute re-emits on every navigation (including query-only changes
  // on the same route). injectRouteNode would only re-emit when the node
  // activates/deactivates — so a filter=all → filter=letter change would
  // leave `filter` frozen at "all" forever, and all buttons would look like
  // the initial active one.
  template: `
    <div>
      <h1>Query-only navigation</h1>
      <p>
        Changing the filter via query params is still a navigation, so VT runs.
        The <strong>inner list container</strong> has its own
        <code>view-transition-name: query-demo-list</code> — only this area
        animates, while the page header and buttons stay fixed.
      </p>

      <div class="vt-qd-toolbar">
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

      <ul class="vt-qd-list" data-vt-scope="query-demo-list">
        @for (item of visible(); track item.id) {
          <li class="vt-qd-item" [style.--vt-qd-name]="'vt-qd-' + item.id">
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

  readonly filter = computed<Filter>(() => {
    const search = this.state.routeState().route.search;
    const raw = search?.filter as Filter | undefined;

    return raw && FILTERS.includes(raw) ? raw : "all";
  });

  readonly visible = computed(() => {
    const f = this.filter();

    return f === "all" ? ITEMS : ITEMS.filter((item) => item.category === f);
  });
}
