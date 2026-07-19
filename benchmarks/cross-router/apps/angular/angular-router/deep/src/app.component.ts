import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";

// DEEP_TARGETS — the sweep depths the driver navigates to; imported from routes.ts
// (single source, audit 07-18 K19 — a local twin copy here is exactly the drift
// class that twice broke the search sweep).
import { DEEP_TARGETS } from "./routes";

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
