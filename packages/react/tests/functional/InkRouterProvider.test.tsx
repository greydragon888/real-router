import { Text } from "ink";
import { render } from "ink-testing-library";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { InkRouterProvider } from "../../src/components/InkRouterProvider";
import { useRouter } from "../../src/hooks/useRouter";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { FC } from "react";

const RouterMarker: FC = () => {
  const router = useRouter();

  return <Text>router-ok:{String(typeof router.navigate === "function")}</Text>;
};

describe("InkRouterProvider", () => {
  let router: Router;
  let querySelectorSpy: MockInstance;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
    querySelectorSpy = vi.spyOn(document, "querySelector");
  });

  afterEach(() => {
    router.stop();
    querySelectorSpy.mockRestore();
  });

  it("renders children", () => {
    const { lastFrame } = render(
      <InkRouterProvider router={router}>
        <Text>Hello</Text>
      </InkRouterProvider>,
    );

    expect(lastFrame()).toContain("Hello");
  });

  it("does not mount route-announcer", () => {
    render(
      <InkRouterProvider router={router}>
        <Text>x</Text>
      </InkRouterProvider>,
    );

    const announcerCalls = querySelectorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("real-router-announcer"),
    );

    expect(announcerCalls).toHaveLength(0);
  });

  it("provides router context to descendants", () => {
    const { lastFrame } = render(
      <InkRouterProvider router={router}>
        <RouterMarker />
      </InkRouterProvider>,
    );

    expect(lastFrame()).toContain("router-ok:true");
  });
});
