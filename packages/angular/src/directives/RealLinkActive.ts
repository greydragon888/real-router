import {
  Directive,
  ElementRef,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { createActiveSource } from "@real-router/sources";

import { applyLinkA11y } from "../dom-utils";
import { injectRouter } from "../functions/injectRouter";
import { createStableParams } from "../internal/createStableParams";
import { subscribeSourceToSignal } from "../internal/subscribeSourceToSignal";

import type { Params } from "@real-router/core";

@Directive({ selector: "[realLinkActive]" })
export class RealLinkActive {
  readonly realLinkActive = input<string>("");
  readonly routeName = input<string>("");
  // Default `undefined` (NOT {}): an omitted `routeParams` must reach
  // `createActiveRouteSource` (via `stableParams`) as `undefined` so the active
  // source keys "" and shares ONE cached source with a manual
  // `injectIsActiveRoute(name)`, instead of keying "{}" and opening a second
  // eager subscription for the same question (#776). Mirrors `RealLink`.
  readonly routeParams = input<Params | undefined>(undefined);
  readonly activeStrict = input(false);
  readonly ignoreQueryParams = input(true);

  private readonly router = injectRouter();
  private readonly element = inject(ElementRef).nativeElement as HTMLElement;
  private readonly isActive = signal(false);
  // Content-stable `routeParams` (#988) — see the matching field in `RealLink`.
  // Lets the source-creation effect bail until param content actually changes
  // instead of churning on every fresh inline-literal binding.
  private readonly stableParams = createStableParams(this.routeParams);
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
      // Fast path (#1103) for default-options links — shared name selector
      // instead of a per-link source; see `createActiveSource`. RealLinkActive
      // has no `hash` input, so it is always passed `undefined`.
      const source = createActiveSource(
        this.router,
        this.routeName(),
        this.stableParams(),
        // Query channel (RFC-4 M2, #1548) — RealLinkActive is styling-only and
        // has no `routeSearch` input (parity with its no-`hash` policy).
        undefined,
        this.activeStrict(),
        this.ignoreQueryParams(),
        undefined,
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
