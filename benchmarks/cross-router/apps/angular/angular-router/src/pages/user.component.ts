import { Component, computed, input } from "@angular/core";
import { RouterLink } from "@angular/router";

// `withComponentInputBinding()` maps the `:id` path param → the `id` input.
@Component({
  selector: "user-page",
  imports: [RouterLink],
  template: `
    <main data-testid="page-user" [attr.data-id]="id()"><h1>User {{ id() }}</h1></main>
    <a [routerLink]="['/users', nextId()]" data-testid="link-user-next">Next</a>
  `,
})
export class UserComponent {
  readonly id = input<string>("");
  readonly nextId = computed(() => String(Number(this.id()) + 1));
}
