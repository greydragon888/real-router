import { Component, computed, input } from "@angular/core";
import { injectRoute, RealLink } from "@real-router/angular";

// Single source — sweep targets live in ./routes.ts (WIDE_COUNT derives from their max),
// so the nav links and the route table can't drift.
import { WIDE_TARGETS } from "./routes";

// Wide/deep leaf — `data-n` lets the sweep driver confirm it reached item N.
@Component({
  selector: "catalog-item",
  template: `<main data-testid="page-item" [attr.data-n]="n()">
    <h1>Item {{ n() }}</h1>
  </main>`,
})
export class CatalogItemComponent {
  readonly n = input<string>("");
}

// 1000 flat routes are rendered via a single name-parsing branch (idiomatic for
// generated route tables — you don't write 1000 <ng-template routeMatch>).
@Component({
  selector: "wide-content",
  imports: [CatalogItemComponent],
  template: `
    @if (isItem()) {
      <catalog-item [n]="n()" />
    } @else {
      <main data-testid="page-home"><h1>Home</h1></main>
    }
  `,
})
export class WideContentComponent {
  private readonly route = injectRoute();
  readonly name = computed(() => this.route.routeState().route.name);
  readonly isItem = computed(() => this.name().startsWith("item"));
  readonly n = computed(() => this.name().slice(4));
}

@Component({
  selector: "app-root",
  imports: [RealLink, WideContentComponent],
  template: `
    <nav>
      @for (n of targets; track n) {
        <a
          realLink
          [routeName]="'item' + n"
          [attr.data-testid]="'link-item-' + n"
          >Item {{ n }}</a
        >
      }
    </nav>
    <wide-content />
  `,
})
export class AppComponent {
  readonly targets = WIDE_TARGETS;
}
