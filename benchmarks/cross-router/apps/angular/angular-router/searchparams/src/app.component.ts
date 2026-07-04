import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";

const SEARCH_COUNTS = [1, 10, 50] as const;

@Component({
  selector: "app-root",
  imports: [RouterLink, RouterOutlet],
  template: `
    <nav>
      @for (n of counts; track n) {
        <a
          [routerLink]="path(n)"
          [queryParams]="query(n)"
          [attr.data-testid]="'link-search-' + n"
          >{{ n }}</a
        >
      }
    </nav>
    <router-outlet />
  `,
})
export class AppComponent {
  readonly counts = SEARCH_COUNTS;
  // /sN path segment — query params ride on [queryParams] (RouterLink does not
  // parse a query string embedded in the path, so the object binding below is the
  // Angular idiom for navigating to /sN?k1=v1&…&kN=vN).
  path(n: number): string {
    return `/s${n}`;
  }
  // { k1: "v1", …, kN: "vN" } → Angular serializes to ?k1=v1&…&kN=vN.
  query(n: number): Record<string, string> {
    return Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`k${i + 1}`, `v${i + 1}`]),
    );
  }
}
