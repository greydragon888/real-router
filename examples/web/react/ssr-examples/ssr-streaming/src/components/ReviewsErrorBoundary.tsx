import { Component } from "react";

import type { ErrorInfo, ReactElement, ReactNode } from "react";

interface ReviewsErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ReviewsErrorBoundaryState {
  readonly error: Error | null;
}

// Class component because React 19's `use(rejectedPromise)` throws during render —
// only ErrorBoundary class API catches render-thrown errors. The boundary
// scope is intentionally narrow: it wraps just the deferred Reviews section
// so failures don't crash the surrounding ProductDetail tree.
export class ReviewsErrorBoundary extends Component<
  ReviewsErrorBoundaryProps,
  ReviewsErrorBoundaryState
> {
  state: ReviewsErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ReviewsErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn(
      "[Reviews] section failed:",
      error.message,
      info.componentStack,
    );
  }

  render(): ReactElement {
    if (this.state.error) {
      return (
        <p data-testid="reviews-error">
          Reviews unavailable: {this.state.error.message}
        </p>
      );
    }

    return <>{this.props.children}</>;
  }
}
