import { render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import StreamedNoFallbackTest from "../helpers/StreamedNoFallbackTest.svelte";
import StreamedTest from "../helpers/StreamedTest.svelte";

describe("Streamed", () => {
  it("renders fallback while the pending promise is unresolved", () => {
    const pending = new Promise<string[]>(() => undefined);

    render(StreamedTest, { pending });

    expect(screen.getByTestId("pending")).toBeInTheDocument();
    expect(screen.queryByTestId("resolved")).not.toBeInTheDocument();
  });

  it("renders children with the resolved value once the promise settles", async () => {
    const pending = Promise.resolve(["r1", "r2"]);

    render(StreamedTest, { pending });

    await waitFor(() => {
      expect(screen.getByTestId("resolved")).toBeInTheDocument();
    });

    expect(screen.getByTestId("resolved")).toHaveTextContent("r1,r2");
  });

  it("omits the fallback DOM when the fallback snippet is not provided", () => {
    const pending = new Promise<string>(() => undefined);

    const { container } = render(StreamedNoFallbackTest, { pending });

    expect(container.textContent).toBe("");
    expect(screen.queryByTestId("resolved")).not.toBeInTheDocument();
  });
});
