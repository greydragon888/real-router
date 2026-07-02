import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";

// DEEP_TARGETS — the sweep depths (3 / 30 / 60 / 90) the driver navigates to.
const DEEP_TARGETS = [3, 30, 60, 90] as const;

// URL path to depth d: /deep/l1/l2/.../ld
function deepPath(d: number): string {
  let p = "/deep";
  for (let i = 1; i <= d; i++) p += `/l${i}`;
  return p;
}

@Component({
  selector: "app-root",
  imports: [RouterLink, RouterOutlet],
  template: `
    <nav>
      @for (d of targets; track d) {
        <a [routerLink]="path(d)" [attr.data-testid]="'link-deep-' + d"
          >Depth {{ d }}</a
        >
      }
    </nav>
    <router-outlet />
  `,
})
export class AppComponent {
  readonly targets = DEEP_TARGETS;
  path(d: number): string {
    return deepPath(d);
  }
}
