import { Component, inject, input } from "@angular/core";
import { ActivatedRoute, RouterOutlet } from "@angular/router";

// One level in the deep chain. Renders the next level via <router-outlet>; when it
// is the deepest matched route (no activated child), it renders the page-item leaf
// marker. `depth` is bound from the route's static `data.depth`.
@Component({
  selector: "level-page",
  imports: [RouterOutlet],
  template: `
    @if (isLeaf()) {
      <main data-testid="page-item" [attr.data-n]="depth()">
        <h1>Item {{ depth() }}</h1>
      </main>
    }
    <router-outlet />
  `,
})
export class LevelComponent {
  private readonly route = inject(ActivatedRoute);
  readonly depth = input<string>("");
  isLeaf(): boolean {
    return this.route.firstChild === null;
  }
}
