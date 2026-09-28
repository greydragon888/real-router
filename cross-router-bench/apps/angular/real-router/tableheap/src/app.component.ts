import { Component, computed } from "@angular/core";
import { injectRoute } from "@real-router/angular";

import { routeCount } from "./routes";

@Component({
  selector: "app-root",
  template: `<main data-testid="page-ready" [attr.data-n]="n">
    {{ routeName() }}
  </main>`,
})
export class AppComponent {
  private readonly route = injectRoute();
  readonly n = String(routeCount);
  readonly routeName = computed(() => this.route.routeState().route.name);
}
