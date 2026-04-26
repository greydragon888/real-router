import { Component } from "@angular/core";
import { injectRouterTransition } from "@real-router/angular";

@Component({
  selector: "progress-bar",
  template: `
    @if (transition().isTransitioning) {
      <div
        class="progress-bar"
        data-testid="progress-bar"
        style="width: 100%;"
      ></div>
    }
  `,
})
export class ProgressBarComponent {
  readonly transition = injectRouterTransition();
}
