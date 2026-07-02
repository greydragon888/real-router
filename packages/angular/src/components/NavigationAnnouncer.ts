import {
  Component,
  inject,
  DestroyRef,
  input,
  type OnInit,
} from "@angular/core";

import { createRouteAnnouncer } from "../dom-utils";
import { injectRouter } from "../functions/injectRouter";

import type { RouteAnnouncerOptions } from "../dom-utils";
import type { State } from "@real-router/core";

@Component({
  selector: "navigation-announcer",
  template: "",
})
export class NavigationAnnouncer implements OnInit {
  /**
   * Optional announcer customization — mirrors the `announceNavigation`
   * options exposed by the react/preact/vue/solid/svelte adapters.
   * `prefix` overrides the default `"Navigated to "`; `getAnnouncementText`
   * computes the full announcement from the resolved route (falling back to
   * the default `h1 → title → route-name` chain on empty/throw). Read once in
   * `ngOnInit` — after the input bindings have fired — because signal inputs
   * are not yet bound at field-initialization time (same pattern as the SSR
   * `<http-status-code>` component).
   */
  readonly prefix = input<string>();
  readonly getAnnouncementText = input<(route: State) => string>();

  private readonly router = injectRouter();
  private announcer: { destroy: () => void } | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.announcer?.destroy();
    });
  }

  ngOnInit(): void {
    const prefix = this.prefix();
    const getAnnouncementText = this.getAnnouncementText();

    // Build the options object omitting unset fields so it stays assignable to
    // `RouteAnnouncerOptions` under exactOptionalPropertyTypes (`{ prefix:
    // undefined }` is rejected). An empty object is equivalent to no options.
    const options: RouteAnnouncerOptions = {
      ...(prefix !== undefined && { prefix }),
      ...(getAnnouncementText !== undefined && { getAnnouncementText }),
    };

    this.announcer = createRouteAnnouncer(this.router, options);
  }
}
