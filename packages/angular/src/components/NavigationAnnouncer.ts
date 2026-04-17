import { Component, inject, DestroyRef } from "@angular/core";

import { createRouteAnnouncer } from "../dom-utils";
import { injectRouter } from "../functions/injectRouter";

@Component({
  selector: "navigation-announcer",
  template: "",
})
export class NavigationAnnouncer {
  private readonly announcer = createRouteAnnouncer(injectRouter());

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.announcer.destroy();
    });
  }
}
