import { Component } from "@angular/core";
import { injectRoute } from "@real-router/angular";

@Component({
  selector: "home-page",
  template: `
    <div>
      <h1>Home</h1>
      <p>Welcome to the Real-Router basic example.</p>
      <p>
        Current route:
        <strong>{{ routeState().route?.name ?? "—" }}</strong>
      </p>
      <p>
        Use the sidebar to navigate between pages. Try clicking <em>Back</em>
        and <em>Forward</em> in the browser — routing state is preserved in the
        URL.
      </p>
    </div>
  `,
})
export class HomeComponent {
  private readonly route = injectRoute();
  readonly routeState = this.route.routeState;
}
