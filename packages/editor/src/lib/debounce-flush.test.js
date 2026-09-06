import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFlushScheduler } from "./debounce-flush.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createFlushScheduler", () => {
  it("runs once after the delay elapses", async () => {
    const run = vi.fn();
    const { schedule } = createFlushScheduler({ delay: 1000, run });
    schedule();
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("restarts the timer on every schedule() call, coalescing rapid changes", async () => {
    const run = vi.fn();
    const { schedule } = createFlushScheduler({ delay: 1000, run });
    schedule();
    await vi.advanceTimersByTimeAsync(600);
    schedule();
    await vi.advanceTimersByTimeAsync(600);
    // 1200ms have passed but the timer was reset at 600ms, so only 600ms of
    // quiet elapsed after the last schedule() — not enough to fire yet.
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("flush() runs immediately and cancels the pending timer", async () => {
    const run = vi.fn();
    const { schedule, flush } = createFlushScheduler({ delay: 1000, run });
    schedule();
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    // The original timer must not fire a second time.
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("cancel() drops a pending run without calling run", async () => {
    const run = vi.fn();
    const { schedule, cancel } = createFlushScheduler({ delay: 1000, run });
    schedule();
    cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).not.toHaveBeenCalled();
  });

  it("flush() with nothing scheduled still runs once", async () => {
    const run = vi.fn();
    const { flush } = createFlushScheduler({ delay: 1000, run });
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
