import { Component } from "@angular/core";
import { injectRoute } from "@real-router/angular";

@Component({
  selector: "home-page",
  template: `
    <div>
      <h1>Home</h1>
      <p>
        This app uses <code>hashPluginFactory</code> — URLs look like
        <code>index.html#!/dashboard</code> instead of <code>/dashboard</code>.
      </p>
      <p>
        No server configuration needed — works on GitHub Pages, S3, and any
        static host. Reload the page: the hash is preserved, so you land on the
        same route.
      </p>
      <p>
        Current route:
        <strong>{{ routeState().route?.name ?? "—" }}</strong>
      </p>
      <p>
        Current URL hash:
        <strong>{{ currentHash }}</strong>
      </p>
    </div>
  `,
})
export class HomeComponent {
  private readonly route = injectRoute();
  readonly routeState = this.route.routeState;
  get currentHash(): string {
    return globalThis.location.hash || "(empty)";
  }
}
