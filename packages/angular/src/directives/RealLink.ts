import {
  Directive,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { createActiveRouteSource } from "@real-router/sources";

import { buildHref, navigateWithHash, shouldNavigate } from "../dom-utils";
import { injectRouter } from "../functions/injectRouter";
import { buildActiveRouteOptions } from "../internal/buildActiveRouteOptions";
import { createStableParams } from "../internal/createStableParams";
import { subscribeSourceToSignal } from "../internal/subscribeSourceToSignal";

import type { Params, NavigationOptions } from "@real-router/core";

const NOOP_CATCH = (): void => {};

// Frozen no-params singleton — used where navigation/href building need a
// concrete object. The `routeParams` input itself defaults to `undefined` (NOT
// this), so the active-route source keys "" and dedups with a manual
// `injectIsActiveRoute(name)` instead of keying "{}" (#776).
const EMPTY_PARAMS = Object.freeze({});

@Directive({
  selector: "a[realLink]",
  host: {
    "(click)": "onClick($event)",
  },
})
export class RealLink {
  readonly routeName = input<string>("");
  // Default `undefined` (NOT {}): an omitted `routeParams` must reach
  // `createActiveRouteSource` (via `stableParams`) as `undefined` so the active
  // source keys "" and shares ONE cached source / router subscription with a
  // manual `injectIsActiveRoute(name)`. Defaulting to {} keys "{}" and splits
  // the same logical question into a second eager subscription (#776).
  readonly routeParams = input<Params | undefined>(undefined);
  readonly routeOptions = input<NavigationOptions>({});
  readonly activeClassName = input<string>("active");
  readonly activeStrict = input(false);
  readonly ignoreQueryParams = input(true);
  /**
   * URL fragment (decoded form, no leading "#") (#532).
   * - omitted/`undefined` → preserve current fragment on same-route navigation
   * - `""` → clear fragment
   * - non-empty → set fragment
   */
  readonly hash = input<string | undefined>(undefined);

  private readonly router = injectRouter();
  private readonly anchor = inject(ElementRef)
    .nativeElement as HTMLAnchorElement;
  private readonly isActive = signal(false);
  // Content-stable `routeParams` (#988). Angular re-allocates an inline
  // `[routeParams]="{ id: 1 }"` literal on every change detection, so the raw
  // signal input changes identity each navigation even when the param content
  // is unchanged. Feeding the stabilized signal to the `href` computed and the
  // source-creation effect lets both bail (Object.is on the cached reference)
  // until param content actually changes — mirrors the Vue `<Link>` fix.
  private readonly stableParams = createStableParams(this.routeParams);
  // `href` is computed from signal inputs only — Angular's default Object.is
  // equality already collapses repeated `string` results, so no custom
  // comparator is required (review §8b note 3 — applies after verifying that
  // `buildHref` returns a primitive).
  private readonly href = computed(() => {
    const hashValue = this.hash();

    return buildHref(
      this.router,
      this.routeName(),
      this.stableParams() ?? EMPTY_PARAMS,
      hashValue === undefined ? undefined : { hash: hashValue },
    );
  });
  private prevActiveClass = "";
  private prevHref: string | undefined = undefined;
  // Skip-same-value: only re-touch the DOM `class` list when the active state
  // actually flipped. Without this, every navigation that re-fires the active
  // source still issues a `classList.toggle` no-op (review §8b MEDIUM).
  private prevActive: boolean | undefined = undefined;

  constructor() {
    // Reactive source-creation effect (#630 fix) — see
    // `packages/angular/CLAUDE.md` → "Directives use constructor + effect()".
    // Reading signal inputs inside `effect()` re-creates the active-route
    // source whenever any input changes; `onCleanup` tears the previous
    // subscription down.
    effect((onCleanup) => {
      const source = createActiveRouteSource(
        this.router,
        this.routeName(),
        this.stableParams(),
        buildActiveRouteOptions(
          this.activeStrict(),
          this.ignoreQueryParams(),
          this.hash(),
        ),
      );

      onCleanup(
        subscribeSourceToSignal(source, (snap) => {
          // Pure-href refresh: when the active flag did not change, only the
          // href may have moved (e.g. param-only update on a parent route).
          // Skip the classList work in that branch (review §8b MEDIUM).
          if (snap === this.prevActive) {
            this.isActive.set(snap);
            this.updateHref();

            return;
          }

          this.prevActive = snap;
          this.isActive.set(snap);
          this.updateHref();
          this.updateActiveClass();
        }),
      );
    });
  }

  onClick(event: MouseEvent): void {
    if (!shouldNavigate(event) || this.anchor.target === "_blank") {
      return;
    }

    event.preventDefault();
    navigateWithHash(
      this.router,
      this.routeName(),
      this.routeParams() ?? EMPTY_PARAMS,
      this.hash(),
      this.routeOptions(),
    ).catch(NOOP_CATCH);
  }

  private updateHref(): void {
    const href = this.href();

    if (href !== undefined && href !== this.prevHref) {
      this.anchor.setAttribute("href", href);
    }

    this.prevHref = href;
  }

  private updateActiveClass(): void {
    const activeClass = this.activeClassName();

    if (this.prevActiveClass && this.prevActiveClass !== activeClass) {
      this.anchor.classList.remove(this.prevActiveClass);
    }

    if (activeClass) {
      this.anchor.classList.toggle(activeClass, this.isActive());
    }

    this.prevActiveClass = activeClass;
  }
}
