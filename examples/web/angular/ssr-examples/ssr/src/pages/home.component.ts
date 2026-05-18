import { Component } from "@angular/core";
import { ClientOnly, ServerOnly } from "@real-router/angular/ssr";

@Component({
  selector: "home-page",
  template: `
    <div>
      <h1>Welcome</h1>
      <p>Real-Router SSR example with Angular 21 and AngularNodeAppEngine.</p>

      <!-- Dogfooding: <client-only> + <server-only> SSR boundaries. -->
      <section aria-labelledby="ssr-boundaries-heading">
        <h2 id="ssr-boundaries-heading">SSR boundaries</h2>

        <ng-template #clientFallback>
          <p data-testid="ssr-boundaries-client-fallback">
            Loading client widget…
          </p>
        </ng-template>
        <client-only [fallback]="clientFallback">
          <p data-testid="ssr-boundaries-client">
            Mounted on the client
          </p>
        </client-only>

        <ng-template #serverFallback>
          <p data-testid="ssr-boundaries-server-fallback">
            Hidden after hydration
          </p>
        </ng-template>
        <server-only [fallback]="serverFallback">
          <p data-testid="ssr-boundaries-server">
            Server-only content (e.g. SEO meta, zero-JS notice)
          </p>
        </server-only>
      </section>
    </div>
  `,
  imports: [ClientOnly, ServerOnly],
})
export class HomeComponent {}
