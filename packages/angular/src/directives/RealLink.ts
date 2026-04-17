import {
  Directive,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  DestroyRef,
  type OnInit,
} from "@angular/core";
import { createActiveRouteSource } from "@real-router/sources";

import { buildHref, shouldNavigate } from "../dom-utils";
import { injectRouter } from "../functions/injectRouter";

import type { Params, NavigationOptions } from "@real-router/core";

@Directive({
  selector: "a[realLink]",
  host: {
    "(click)": "onClick($event)",
  },
})
export class RealLink implements OnInit {
  readonly routeName = input<string>("");
  readonly routeParams = input<Params>({});
  readonly routeOptions = input<NavigationOptions>({});
  readonly activeClassName = input<string>("active");
  readonly activeStrict = input(false);
  readonly ignoreQueryParams = input(true);

  private readonly router = injectRouter();
  private readonly destroyRef = inject(DestroyRef);
  private readonly anchor = inject(ElementRef)
    .nativeElement as HTMLAnchorElement;
  private readonly isActive = signal(false);
  private readonly href = computed(() =>
    buildHref(this.router, this.routeName(), this.routeParams()),
  );
  private prevActiveClass = "";

  ngOnInit(): void {
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
    this.updateDom();

    const unsub = source.subscribe(() => {
      this.isActive.set(source.getSnapshot());
      this.updateDom();
    });

    this.destroyRef.onDestroy(() => {
      unsub();
      source.destroy();
    });
  }

  onClick(event: MouseEvent): void {
    if (!shouldNavigate(event) || this.anchor.target === "_blank") {
      return;
    }

    event.preventDefault();
    this.router
      .navigate(this.routeName(), this.routeParams(), this.routeOptions())
      .catch(() => {});
  }

  private updateDom(): void {
    const href = this.href();

    if (href !== undefined) {
      this.anchor.setAttribute("href", href);
    }

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
