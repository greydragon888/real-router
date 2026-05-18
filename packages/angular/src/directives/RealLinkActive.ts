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
import { buildActiveRouteOptions } from "../internal/buildActiveRouteOptions";
import { subscribeSourceToSignal } from "../internal/subscribeSourceToSignal";

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
  // Skip-same-value: only touch `classList.toggle` when the active flag
  // actually flipped. Saves one DOM write per RealLinkActive per unrelated
  // navigation (review §8b MEDIUM).
  private prevActive: boolean | undefined = undefined;

  constructor() {
    // One-time a11y setup — doesn't depend on signal inputs, stays in
    // constructor body. `applyLinkA11y` is idempotent so re-running would
    // be safe, but we only need it once per element.
    applyLinkA11y(this.element);

    // Reactive source-creation effect (#630 fix) — see
    // `packages/angular/CLAUDE.md` → "Directives use constructor + effect()".
    effect((onCleanup) => {
      const source = createActiveRouteSource(
        this.router,
        this.routeName(),
        this.routeParams(),
        buildActiveRouteOptions(
          this.activeStrict(),
          this.ignoreQueryParams(),
          undefined,
        ),
      );

      onCleanup(
        subscribeSourceToSignal(source, (snap) => {
          if (snap === this.prevActive) {
            return;
          }

          this.prevActive = snap;
          this.isActive.set(snap);
          this.updateClass();
        }),
      );
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
