import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { Streamed } from "@real-router/solid/ssr";

describe("<Streamed>", () => {
  it("renders children when no descendant suspends", () => {
    render(() => (
      <Streamed fallback={<span data-testid="fallback">loading</span>}>
        <span data-testid="ready">ready</span>
      </Streamed>
    ));

    expect(screen.getByTestId("ready")).toBeInTheDocument();
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });
});
