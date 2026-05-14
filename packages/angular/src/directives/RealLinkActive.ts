import {
  Directive,
  ElementRef,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { createActiveRouteSource } from "@real-router/sources";

import { applyLinkA11y } from "../dom-utils";
import { injectRouter } from "../functions/injectRouter";

import type { Params } from "@real-router/core";

@Directive({ selector: "[realLinkActive]" })
export class RealLinkActive {
  readonly realLinkActive = input<string>("");
  readonly routeName = input<string>("");
  readonly routeParams = input<Params>({});
  readonly activeStrict = input(false);
  readonly ignoreQueryParams = input(true);

  private readonly router = injectRouter();
  private readonly element = inject(ElementRef).nativeElement as HTMLElement;
  private readonly isActive = signal(false);

  constructor() {
    // One-time a11y setup — doesn't depend on signal inputs, stays in
    // constructor body. `applyLinkA11y` is idempotent so re-running would
    // be safe, but we only need it once per element.
    applyLinkA11y(this.element);

    // Reactive source-creation effect (#630 fix). See RealLink.ts for the
    // full rationale — same asymmetric-reactivity bug applied here:
    // previous `ngOnInit` setup captured `(routeName, routeParams)` once,
    // so changing those inputs reactively in AOT did not update the
    // active-class tracking. Moving setup into `effect()` makes the source
    // creation reactive to all bound signal inputs.
    effect((onCleanup) => {
      const source = createActiveRouteSource(
        this.router,
        this.routeName(),
        this.routeParams(),
        {
          strict: this.activeStrict(),
          ignoreQueryParams: this.ignoreQueryParams(),
        },
      );

      this.isActive.set(source.getSnapshot());
      this.updateClass();

      const unsub = source.subscribe(() => {
        this.isActive.set(source.getSnapshot());
        this.updateClass();
      });

      onCleanup(() => {
        unsub();
        source.destroy();
      });
    });
  }

  private updateClass(): void {
    const className = this.realLinkActive();

    if (!className) {
      return;
    }

    this.element.classList.toggle(className, this.isActive());
  }
}
