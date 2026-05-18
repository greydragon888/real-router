import { Component, computed } from "@angular/core";
import { injectRoute } from "@real-router/angular";

interface ProfileData {
  id: string;
  name: string;
}

@Component({
  selector: "user-profile-page",
  template: `
    <main data-testid="user-profile">
      <h1>User profile (data-only)</h1>
      <p data-testid="profile-shell">
        Server fetched the data and shipped JSON; this shell renders without
        SSR'd HTML, the client hydrates from
        <code>__SSR_STATE__.context.data</code>.
      </p>
      @if (data(); as d) {
        <p data-testid="profile-data">{{ d.id }} — {{ d.name }}</p>
      }
    </main>
  `,
})
export class UserProfileComponent {
  private readonly route = injectRoute();

  readonly data = computed<ProfileData | undefined>(
    () => this.route.routeState().route.context.data as ProfileData | undefined,
  );
}
