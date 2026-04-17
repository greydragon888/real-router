import {
  Directive,
  ElementRef,
  inject,
  input,
  signal,
  DestroyRef,
  type OnInit,
} from "@angular/core";
import { createActiveRouteSource } from "@real-router/sources";

import { applyLinkA11y } from "../dom-utils";
import { injectRouter } from "../functions/injectRouter";

import type { Params } from "@real-router/core";

@Directive({ selector: "[realLinkActive]" })
export class RealLinkActive implements OnInit {
  readonly realLinkActive = input<string>("");
  readonly routeName = input<string>("");
  readonly routeParams = input<Params>({});
  readonly activeStrict = input(false);
  readonly ignoreQueryParams = input(true);

  private readonly router = injectRouter();
  private readonly destroyRef = inject(DestroyRef);
  private readonly element = inject(ElementRef).nativeElement as HTMLElement;
  private readonly isActive = signal(false);

  constructor() {
    applyLinkA11y(this.element);
  }

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
    this.updateClass();

    const unsub = source.subscribe(() => {
      this.isActive.set(source.getSnapshot());
      this.updateClass();
    });

    this.destroyRef.onDestroy(() => {
      unsub();
      source.destroy();
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
