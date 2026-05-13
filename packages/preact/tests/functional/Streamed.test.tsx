import { act, render, screen, waitFor } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

import { Streamed } from "@real-router/preact/ssr";

describe("<Streamed>", () => {
  it("renders children when no descendant suspends", () => {
    render(
      <Streamed fallback={<span data-testid="fallback">loading</span>}>
        <span data-testid="ready">ready</span>
      </Streamed>,
    );

    expect(screen.getByTestId("ready")).toBeInTheDocument();
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("shows fallback while a child is suspended", () => {
    const neverResolving = new Promise<void>(() => undefined);

    const SuspendingChild = () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw neverResolving;
    };

    render(
      <Streamed fallback={<span data-testid="fallback">loading</span>}>
        <SuspendingChild />
      </Streamed>,
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("ready")).not.toBeInTheDocument();
  });

  it("shows children once the suspended promise resolves", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    let resolved = false;

    const SuspendingChild = () => {
      if (!resolved) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw pending;
      }

      return <span data-testid="ready">ready</span>;
    };

    render(
      <Streamed fallback={<span data-testid="fallback">loading</span>}>
        <SuspendingChild />
      </Streamed>,
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("ready")).not.toBeInTheDocument();

    resolved = true;

    await act(async () => {
      resolve();
      await pending;
    });

    await waitFor(() => {
      expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
      expect(screen.getByTestId("ready")).toBeInTheDocument();
    });
  });
});
