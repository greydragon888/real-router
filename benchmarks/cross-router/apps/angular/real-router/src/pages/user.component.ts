import { Component, computed } from "@angular/core";
import { injectRoute, RealLink } from "@real-router/angular";

// Param page — `data-id` lets the driver detect the param actually changed.
// injectRoute().routeState() is a signal of the current State.
@Component({
  selector: "user-page",
  imports: [RealLink],
  template: `
    <main data-testid="page-user" [attr.data-id]="id()"><h1>User {{ id() }}</h1></main>
    <a
      realLink
      routeName="user"
      [routeParams]="{ id: nextId() }"
      data-testid="link-user-next"
      >Next</a
    >
  `,
})
export class UserComponent {
  private readonly route = injectRoute<{ id: string }>();
  readonly id = computed(() => this.route.routeState().route.params.id);
  readonly nextId = computed(() => String(Number(this.id()) + 1));
}
