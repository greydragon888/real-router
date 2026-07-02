import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";

// WIDE_TARGETS — the sweep positions (item-10 / -100 / -1000) the driver clicks.
const WIDE_TARGETS = [10, 100, 1000] as const;

@Component({
  selector: "app-root",
  imports: [RouterLink, RouterOutlet],
  template: `
    <nav>
      @for (n of targets; track n) {
        <a
          [routerLink]="'/catalog/item-' + n"
          [attr.data-testid]="'link-item-' + n"
          >Item {{ n }}</a
        >
      }
    </nav>
    <router-outlet />
  `,
})
export class AppComponent {
  readonly targets = WIDE_TARGETS;
}
