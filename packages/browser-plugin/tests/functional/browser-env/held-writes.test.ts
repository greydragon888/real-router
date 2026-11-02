import { afterEach, describe, expect, it, vi } from "vitest";

import { createHeldWrites } from "../../../src/browser-env";

describe("createHeldWrites (#2879)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("a write outside a hold runs at once, with the caller's own state", () => {
    const writes = createHeldWrites();
    const state = { name: "home" };
    const write = vi.fn<(state: object) => void>();

    writes.run(state, write);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe(state);
  });

  it("an error of a write outside a hold reaches its caller", () => {
    const writes = createHeldWrites();

    expect(() => {
      writes.run("state", () => {
        throw new Error("refused");
      });
    }).toThrow("refused");
  });

  it("held writes run on release, in the order they came", () => {
    const writes = createHeldWrites();
    const order: string[] = [];

    writes.hold(() => undefined);
    writes.run("first", (state) => order.push(state));
    writes.run("second", (state) => order.push(state));

    expect(order).toStrictEqual([]);

    writes.release();

    expect(order).toStrictEqual(["first", "second"]);
  });

  it("a held write keeps the state it was called with, whatever its writer does to the buffer", () => {
    const writes = createHeldWrites();
    const buffer = { name: "home" };
    const write = vi.fn<(state: { name: string }) => void>();

    writes.hold(() => undefined);
    writes.run(buffer, write);
    buffer.name = "about";
    writes.release();

    expect(write).toHaveBeenCalledWith({ name: "home" });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "state"],
  ])("a held write hands %s on as it came", (_name, state) => {
    const writes = createHeldWrites();
    const write = vi.fn<(state: unknown) => void>();

    writes.hold(() => undefined);
    writes.run(state, write);
    writes.release();

    expect(write).toHaveBeenCalledWith(state);
  });

  it("a held write that throws is reported, and the next one runs", () => {
    const writes = createHeldWrites();
    const failure = new Error("DataCloneError");
    const report = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const next = vi.fn<(state: string) => void>();

    writes.hold(() => undefined);
    writes.run("state", () => {
      throw failure;
    });
    writes.run("state", next);
    writes.release();

    expect(report).toHaveBeenCalledWith(expect.any(String), failure);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("a write after the release runs at once", () => {
    const writes = createHeldWrites();
    const write = vi.fn<(state: string) => void>();

    writes.hold(() => undefined);
    writes.release();
    writes.run("state", write);

    expect(write).toHaveBeenCalledTimes(1);
  });

  it("a hold a released write starts stands", () => {
    const writes = createHeldWrites();
    const later = vi.fn<(state: string) => void>();

    writes.hold(() => undefined);
    writes.run("first", () => {
      writes.hold(() => undefined);
    });
    writes.release();
    writes.run("second", later);

    expect(later).not.toHaveBeenCalled();
  });

  it("a release with nothing held does nothing", () => {
    const writes = createHeldWrites();

    expect(() => {
      writes.release();
    }).not.toThrow();
  });

  it("drop discards the writes and tells so", () => {
    const writes = createHeldWrites();
    const write = vi.fn<(state: string) => void>();

    writes.hold(() => undefined);
    writes.run("state", write);

    expect(writes.drop()).toBe(true);

    writes.release();

    expect(write).not.toHaveBeenCalled();
  });

  it("drop of a hold with no write tells nothing was dropped", () => {
    const writes = createHeldWrites();

    writes.hold(() => undefined);

    expect(writes.drop()).toBe(false);
  });

  it("drop with no hold tells nothing was dropped", () => {
    expect(createHeldWrites().drop()).toBe(false);
  });

  describe("the bound", () => {
    it("passes after a second of timers on time", () => {
      vi.useFakeTimers();

      const writes = createHeldWrites();
      const elapsed = vi.fn<() => void>();

      writes.hold(elapsed);

      vi.advanceTimersByTime(999);

      expect(elapsed).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);

      expect(elapsed).toHaveBeenCalledTimes(1);
    });

    it("a firing spends one tick, however late it comes", () => {
      vi.useFakeTimers();

      const writes = createHeldWrites();
      const elapsed = vi.fn<() => void>();

      writes.hold(elapsed);

      // A long task keeps each firing a minute late.
      const fireLate = (): void => {
        vi.setSystemTime(Date.now() + 60_000);
        vi.advanceTimersToNextTimer();
      };

      for (let firing = 0; firing < 9; firing++) {
        fireLate();
      }

      expect(elapsed).not.toHaveBeenCalled();

      fireLate();

      expect(elapsed).toHaveBeenCalledTimes(1);
    });

    it("a second hold starts it over", () => {
      vi.useFakeTimers();

      const writes = createHeldWrites();
      const first = vi.fn<() => void>();
      const second = vi.fn<() => void>();

      writes.hold(first);
      vi.advanceTimersByTime(500);
      writes.hold(second);
      vi.advanceTimersByTime(999);

      expect(second).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);

      expect(second).toHaveBeenCalledTimes(1);
      expect(first).not.toHaveBeenCalled();
    });

    it("a second hold drops the writes of the first", () => {
      const writes = createHeldWrites();
      const dropped = vi.fn<(state: string) => void>();
      const kept = vi.fn<(state: string) => void>();

      writes.hold(() => undefined);
      writes.run("state", dropped);
      writes.hold(() => undefined);
      writes.run("state", kept);
      writes.release();

      expect(dropped).not.toHaveBeenCalled();
      expect(kept).toHaveBeenCalledTimes(1);
    });

    it.each(["release", "drop"] as const)("%s stops it", (end) => {
      vi.useFakeTimers();

      const writes = createHeldWrites();
      const elapsed = vi.fn<() => void>();

      writes.hold(elapsed);
      writes[end]();
      vi.advanceTimersByTime(5000);

      expect(elapsed).not.toHaveBeenCalled();
    });
  });
});
