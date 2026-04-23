import { Component } from "@angular/core";

@Component({
  selector: "home-page",
  template: `
    <div>
      <h1>Home</h1>
      <p>Welcome to the nested routes example.</p>
      <p>
        Click <strong>Users</strong> in the sidebar to explore the nested
        routing section with its own inner navigation and breadcrumbs.
      </p>
    </div>
  `,
})
export class HomeComponent {}
