import { Component } from "@angular/core";

@Component({
  selector: "home-page",
  template: `
    <div data-testid="home-page">
      <h1>Welcome</h1>
      <p>Real-Router SSG example with Angular 21 and renderApplication.</p>
    </div>
  `,
})
export class HomeComponent {}
