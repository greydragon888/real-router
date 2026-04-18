import { NgTemplateOutlet } from "@angular/common";
import {
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from "@angular/core";
import { getErrorSource } from "@real-router/sources";

import { injectRouter } from "../functions/injectRouter";
import { sourceToSignal } from "../sourceToSignal";

import type { TemplateRef } from "@angular/core";
import type { RouterError, State } from "@real-router/core";
import type { RouterErrorSnapshot } from "@real-router/sources";

export interface ErrorContext {
  $implicit: RouterError;
  resetError: () => void;
}

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

  readonly visibleError = computed(() => {
    const snap = this.snapshot();

    return snap.version > this.dismissedVersion() ? snap.error : null;
  });

  readonly errorContext = computed<ErrorContext | null>(() => {
    const error = this.visibleError();

    if (!error) {
      return null;
    }

    return {
      $implicit: error,
      resetError: this.resetError,
    };
  });

  private readonly router = injectRouter();
  private readonly snapshot = sourceToSignal<RouterErrorSnapshot>(
    getErrorSource(this.router),
  );
  private readonly dismissedVersion = signal(-1);

  constructor() {
    effect(() => {
      const snap = this.snapshot();

      if (snap.error) {
        this.onError.emit({
          error: snap.error,
          toRoute: snap.toRoute,
          fromRoute: snap.fromRoute,
        });
      }
    });
  }

  private readonly resetError = (): void => {
    this.dismissedVersion.set(this.snapshot().version);
  };
}
