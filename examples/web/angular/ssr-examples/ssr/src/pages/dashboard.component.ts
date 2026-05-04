import { Component } from "@angular/core";

@Component({
  selector: "dashboard-page",
  template: `
    <div>
      <h1>Dashboard</h1>
      <p>This is a protected page. You are authenticated.</p>
    </div>
  `,
})
export class DashboardComponent {}
