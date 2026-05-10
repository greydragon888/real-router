import { NgTemplateOutlet } from "@angular/common";
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
} from "@angular/core";
import { createDismissableError } from "@real-router/sources";

import { injectRouter } from "../functions/injectRouter";
import { sourceToSignal } from "../sourceToSignal";

import type { ErrorContext } from "../types";
import type { TemplateRef } from "@angular/core";
import type { RouterError, State } from "@real-router/core";
import type { DismissableErrorSnapshot } from "@real-router/sources";

@Component({
  selector: "router-error-boundary",
  template: `
    <ng-content />
    @if (errorContext() && errorTemplate()) {
      <ng-container
        [ngTemplateOutlet]="errorTemplate()!"
        [ngTemplateOutletContext]="errorContext()!"
      />
    }
  `,
  imports: [NgTemplateOutlet],
})
export class RouterErrorBoundary {
  readonly errorTemplate = input<TemplateRef<ErrorContext>>();

  readonly onError = output<{
    error: RouterError;
    toRoute: State | null;
    fromRoute: State | null;
  }>();

  readonly errorContext = computed<ErrorContext | null>(() => {
    const snap = this.snapshot();

    if (!snap.error) {
      return null;
    }

    return {
      $implicit: snap.error,
      resetError: snap.resetError,
    };
  });

  private readonly router = injectRouter();
  private readonly snapshot = sourceToSignal<DismissableErrorSnapshot>(
    createDismissableError(this.router),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    const effectRef = effect(() => {
      const snap = this.snapshot();

      if (snap.error) {
        this.onError.emit({
          error: snap.error,
          toRoute: snap.toRoute,
          fromRoute: snap.fromRoute,
        });
      }
    });

    destroyRef.onDestroy(() => {
      effectRef.destroy();
    });
  }
}
