import { describe, expect, it } from "vitest";

import { MIN_SLIDING_WINDOW } from "../src/config/constants";
import { SlidingWindow } from "../src/core/sliding-window";

describe("SlidingWindow", () => {
  it("returns 0 when empty", () => {
    const w = new SlidingWindow(1000);
    expect(w.getTps(5000)).toBe(0);
  });

  it("returns 0 when all events are older than the window", () => {
    const w = new SlidingWindow(1000);
    w.record(10); // recorded at "now" (Date.now() inside record)
    // Far-future query pushes the event out of the window
    expect(w.getTps(Date.now() + 10_000)).toBe(0);
  });

  it("calculates tps over the window span", () => {
    const w = new SlidingWindow(1000);
    const base = 10_000;
    // Inject events directly via record + controlled timestamps is not
    // possible (record uses Date.now()), so test via getTps arithmetic:
    // record N tokens, then compute expected tps from the same timestamps.
    w.record(100);
    const now = Date.now() + 500;
    const span = Math.max(now - w["events"][0].time, MIN_SLIDING_WINDOW);
    expect(w.getTps(now)).toBeCloseTo((1000 * 100) / span, 5);
  });

  it("only counts tokens inside the window", () => {
    const w = new SlidingWindow(1000);
    const t0 = 10_000; // arbitrary base timestamp
    w.record(100);
    w.record(50);
    // Rewrite timestamps deterministically (record uses Date.now())
    w["events"][0].time = t0;
    w["events"][1].time = t0 + 100;
    const now = t0 + 1000;
    // Both events are inside [now-1000, now]: 150 tokens over a 1000ms span
    expect(w.getTps(now)).toBeCloseTo((1000 * 150) / 1000, 5);
  });

  it("excludes tokens recorded before the window from the count", () => {
    const w = new SlidingWindow(1000);
    const t0 = 10_000;
    w.record(100);
    w.record(50);
    w["events"][0].time = t0 - 5000; // far outside the window
    w["events"][1].time = t0;
    const now = t0 + 500;
    // events[0] is outside [now-1000, now], so only 50 tokens count.
    // Since events[1] is the only in-window event (allSameTimestamp), the
    // span extends back to events[0].time: span = 5500ms.
    expect(w.getTps(now)).toBeCloseTo((1000 * 50) / 5500, 5);
  });

  it("uses MIN_SLIDING_WINDOW as floor for very short spans", () => {
    const w = new SlidingWindow(1000);
    w.record(1000);
    // Query at (nearly) the same instant: span would be ~0
    const now = w["events"][0].time;
    const expected = (1000 * 1000) / MIN_SLIDING_WINDOW;
    expect(w.getTps(now)).toBe(expected);
  });

  it("returns 0 when window contains only zero-token events", () => {
    const w = new SlidingWindow(1000);
    w.record(0);
    expect(w.getTps(Date.now() + 10)).toBe(0);
  });

  it("extends span backwards for same-timestamp bursts after older events", () => {
    const w = new SlidingWindow(10_000);
    const t0 = Date.now();
    // First event well before the burst
    w.record(10);
    w["events"][0].time = t0 - 3000;
    // Burst: all tokens land on one timestamp
    w.record(100);
    w["events"][1].time = t0;
    w.record(100);
    w["events"][2].time = t0;

    // All in-window events after the first share t0; span should start at
    // the previous event (t0-3000), not at t0.
    const now = t0 + 10;
    const span = Math.max(now - (t0 - 3000), MIN_SLIDING_WINDOW);
    expect(w.getTps(now)).toBeCloseTo((1000 * 210) / span, 5);
  });

  it("does not extend span when the burst is the only event", () => {
    const w = new SlidingWindow(10_000);
    w.record(100);
    const now = w["events"][0].time;
    // windowStartIndex is 0, so no previous event to extend to
    expect(w.getTps(now)).toBe((1000 * 100) / MIN_SLIDING_WINDOW);
  });

  it("reset clears all events", () => {
    const w = new SlidingWindow(1000);
    w.record(100);
    w.record(100);
    w.reset();
    expect(w.getTps(Date.now())).toBe(0);
    expect(w["events"]).toHaveLength(0);
    expect(w["windowStartIndex"]).toBe(0);
  });

  it("compacts old events once the dead prefix reaches the threshold", () => {
    const w = new SlidingWindow(1000);
    // Exceed COMPACTION_THRESHOLD (5000) stale events
    for (let i = 0; i < 5001; i++) w.record(1);
    const staleTime = Date.now() - 60_000;
    for (const e of w["events"]) e.time = staleTime;
    // getTps advances windowStartIndex past every stale event
    w.getTps(Date.now() + 10);
    expect(w["windowStartIndex"]).toBe(5001);
    w.record(1); // triggers compaction
    expect(w["windowStartIndex"]).toBe(0);
    expect(w["events"]).toHaveLength(1);
    expect(w["events"][0].tokens).toBe(1); // only the fresh event remains
  });
});
