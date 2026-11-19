import { beforeEach, describe, expect, it, vi } from "vitest";

import { TokenSpeedEngine } from "../src/core/engine";
import { makeSettingsMock } from "./mocks/settings";

// ── Testable subclass with mocked time ──────────────────────────────────────

class TimeMockedEngine extends TokenSpeedEngine {
  constructor(
    settings: ReturnType<typeof makeSettingsMock>,
    private mockTime: number,
  ) {
    super(settings);
  }
  protected override now(): number {
    return this.mockTime;
  }
  /** Advance the mocked clock by `ms` milliseconds. */
  tick(ms: number): void {
    this.mockTime += ms;
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("TokenSpeedEngine", () => {
  let settings: ReturnType<typeof makeSettingsMock>;
  let engine: InstanceType<typeof TokenSpeedEngine>;

  beforeEach(() => {
    settings = makeSettingsMock();
    engine = new TokenSpeedEngine(settings);
    engine.initialize();
    engine.start();
  });

  const deltas = (n: number) => {
    for (let i = 0; i < n; i++) engine.recordDelta("x");
  };

  // ── initialization ─────────────────────────────────────────────────────

  describe("initialization", () => {
    it("is not streaming before start", () => {
      const fresh = new TokenSpeedEngine(settings);
      fresh.initialize();
      expect(fresh.isStreaming).toBe(false);
    });

    it("ignores deltas when not streaming", () => {
      const fresh = new TokenSpeedEngine(settings);
      fresh.initialize();
      fresh.recordDelta("hello");
      expect(fresh.tokenCount).toBe(0);
    });

    it("is a no-op while already streaming", () => {
      deltas(5);
      engine.start(); // must not reset while streaming
      expect(engine.tokenCount).toBe(5);
      expect(engine.isStreaming).toBe(true);
    });

    it("resets counters when restarted after stop", () => {
      deltas(5);
      engine.stop();
      engine.start();
      expect(engine.tokenCount).toBe(0);
      expect(engine.isStreaming).toBe(true);
    });
  });

  // ── direct counting ───────────────────────────────────────────────────

  describe("direct counting", () => {
    it("counts one token per delta", () => {
      deltas(10);
      expect(engine.tokenCount).toBe(10);
    });

    it("counts every delta as exactly one token regardless of content", () => {
      engine.recordDelta("");
      engine.recordDelta("a very long delta with many words");
      expect(engine.tokenCount).toBe(2);
    });
  });

  // ── estimate counting ─────────────────────────────────────────────────

  describe("estimate counting", () => {
    it("estimates tokens from word boundaries and punctuation", () => {
      const est = new TimeMockedEngine(settings, 1000);
      est.initialize();
      est.start();
      (est as unknown as { _countStrategy: string })._countStrategy =
        "estimate";
      est.recordDelta("hello world"); // 2 words
      est.recordDelta(" hi!"); // 1 word + 1 punctuation
      expect(est.tokenCount).toBe(4);
    });

    it("counts nothing for empty deltas", () => {
      const est = new TimeMockedEngine(settings, 1000);
      est.initialize();
      est.start();
      (est as unknown as { _countStrategy: string })._countStrategy =
        "estimate";
      est.recordDelta("");
      expect(est.tokenCount).toBe(0);
    });
  });

  // ── provider tokens ───────────────────────────────────────────────────

  describe("provider tokens", () => {
    it("falls back to direct counting when provider tokens are disabled", () => {
      const prov = new TimeMockedEngine(settings, 1000);
      prov.initialize();
      prov.start();
      // useProviderTokens is false by default: usageOutput is ignored and
      // the delta counts as 1 direct token
      prov.recordDelta("x", 5);
      expect(prov.tokenCount).toBe(1);
    });

    it("uses the provider-reported increment when enabled", () => {
      const prov = new TimeMockedEngine(settings, 1000);
      prov.initialize();
      prov.start();
      (prov as unknown as { _useProviderTokens: boolean })._useProviderTokens =
        true;
      prov.recordDelta("x", 10); // +10
      prov.recordDelta("x", 18); // +8
      expect(prov.tokenCount).toBe(18);
    });

    it("falls back to direct counting for non-increasing usage reports", () => {
      const prov = new TimeMockedEngine(settings, 1000);
      prov.initialize();
      prov.start();
      (prov as unknown as { _useProviderTokens: boolean })._useProviderTokens =
        true;
      prov.recordDelta("x", 10); // +10 (provider)
      prov.recordDelta("x", 10); // no increment → 1 direct token
      prov.recordDelta("x", 25); // +15 (provider)
      expect(prov.tokenCount).toBe(26);
    });
  });

  // ── reconcileTotal ────────────────────────────────────────────────────

  describe("reconcileTotal", () => {
    it("snaps the count to the authoritative value", () => {
      deltas(3);
      engine.reconcileTotal(1234);
      expect(engine.tokenCount).toBe(1234);
    });

    it("ignores non-positive totals", () => {
      deltas(3);
      engine.reconcileTotal(0);
      engine.reconcileTotal(-5);
      expect(engine.tokenCount).toBe(3);
    });
  });

  // ── ttft ──────────────────────────────────────────────────────────────

  describe("ttft", () => {
    it("is 0 before measurement", () => {
      expect(engine.ttft).toBe(0);
    });

    it("is captured only once per stream", () => {
      engine.startTTFT();
      engine.stopTTFT();
      const first = engine.ttft;
      // Additional stop calls must not overwrite the first capture
      engine.stopTTFT();
      expect(engine.ttft).toBe(first);
    });

    it("never reports a negative value", () => {
      engine.startTTFT();
      // stopTTFT not called yet: _ttftEnd is 0, so ttft would be negative
      // without the guard
      expect(engine.ttft).toBeGreaterThanOrEqual(0);
    });
  });

  // ── pause/resume ──────────────────────────────────────────────────────

  describe("pause/resume", () => {
    it("resumes on the next delta after a pause", () => {
      engine.pause();
      engine.recordDelta("x");
      expect(engine.isStreaming).toBe(true);
    });

    it("accumulates paused time", () => {
      engine.pause();
      engine.recordDelta("x");
      engine.pause();
      engine.recordDelta("x");
      // pausedMs should be >= 0 and the delta counted twice
      expect(engine.tokenCount).toBe(2);
      expect(engine.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it("does not leak pause state across streams", () => {
      // Stream 1: pause then stop (no resume) — simulates toolcall_end → message_end
      const eng = new TimeMockedEngine(settings, 1000);
      eng.initialize();
      eng.start();
      eng.recordDelta("x");
      eng.pause();
      eng.tick(5000); // 5s idle while paused
      eng.stop();

      // Stream 2: start fresh — pause must NOT carry over
      eng.start();
      eng.tick(100);
      eng.recordDelta("x"); // triggers resume (now a no-op since _isPaused is false)
      eng.tick(1000); // 1s of actual streaming

      // elapsedMs should be ~1000ms, NOT 5000ms+
      expect(eng.elapsedMs).toBeLessThan(2000);
      expect(eng.tpsAvg).toBeGreaterThan(0);
    });

    it("accounts for trailing pause in stop()", () => {
      const eng = new TimeMockedEngine(settings, 1000);
      eng.initialize();
      eng.start();
      eng.recordDelta("x");
      eng.pause();
      eng.tick(5000); // pause for 5s
      eng.stop(); // should include the 5s in _pausedMs, not in elapsedMs

      // The whole duration was paused: elapsedMs should be ~0
      // (before the fix it would be ~5000 because the pause wasn't subtracted)
      expect(eng.elapsedMs).toBeLessThan(100);
    });
  });

  // ── tps behavior ──────────────────────────────────────────────────────

  describe("tps behavior", () => {
    it("reports the sliding window tps while streaming", () => {
      deltas(5);
      // While streaming, tps reflects the last sliding-window measurement
      expect(engine.tps).toBe(engine["_tps"]);
    });

    it("falls back to the average after streaming ends (default behavior)", () => {
      const mocked = new TimeMockedEngine(settings, 1000);
      mocked.initialize();
      mocked.start();
      for (let i = 0; i < 5; i++) mocked.recordDelta("x");
      mocked.tick(5000); // advance 5s so elapsedSeconds > 0
      mocked.stop();
      // endTpsBehavior is "average": tps === tpsAvg after stop
      expect(mocked.tps).toBe(mocked.tpsAvg);
      // Verify the calculation path was hit
      expect(mocked.tpsAvg).toBeGreaterThan(0);
    });

    it("keeps the last window value when endTpsBehavior is 'last'", () => {
      const lastEngine = new TokenSpeedEngine(settings);
      lastEngine.initialize();
      (lastEngine as unknown as { _endTpsBehavior: string })._endTpsBehavior =
        "last";
      lastEngine.start();
      for (let i = 0; i < 5; i++) lastEngine.recordDelta("x");
      const beforeStop = lastEngine.tps;
      lastEngine.stop();
      expect(lastEngine.tps).toBe(beforeStop);
    });

    it("average is 0 before any time has elapsed", () => {
      const fresh = new TokenSpeedEngine(settings);
      fresh.initialize();
      expect(fresh.tpsAvg).toBe(0);
    });
  });

  // ── stop ──────────────────────────────────────────────────────────────

  describe("stop", () => {
    it("marks the session as no longer streaming", () => {
      engine.stop();
      expect(engine.isStreaming).toBe(false);
    });

    it("ignores deltas after stopping", () => {
      engine.stop();
      engine.recordDelta("x");
      expect(engine.tokenCount).toBe(0);
    });

    it("can stop before initialization", () => {
      const eng = new TokenSpeedEngine(settings);
      expect(() => eng.stop()).not.toThrow();
    });

    it("can start before initialization", () => {
      const eng = new TokenSpeedEngine(settings);
      expect(() => eng.start()).not.toThrow();
    });
  });

  // ── applyProvider ─────────────────────────────────────────────────────

  describe("applyProvider", () => {
    it("calls resolveConfig with the providerId", () => {
      const resolveSpy = vi.spyOn(settings, "resolveConfig");
      const testEngine = new TokenSpeedEngine(settings);
      testEngine.initialize();
      testEngine.applyProvider("anthropic");
      expect(resolveSpy).toHaveBeenCalledWith("anthropic");
    });

    it("is a no-op when called with the same providerId", () => {
      const resolveSpy = vi.spyOn(settings, "resolveConfig");
      const testEngine = new TokenSpeedEngine(settings);
      testEngine.initialize();
      testEngine.applyProvider("anthropic");
      testEngine.applyProvider("anthropic");
      // Second call should not trigger another resolveConfig
      expect(resolveSpy).toHaveBeenCalledTimes(1);
    });

    it("is a no-op while streaming", () => {
      const resolveSpy = vi.spyOn(settings, "resolveConfig");
      const testEngine = new TimeMockedEngine(settings, 1000);
      testEngine.initialize();
      // Apply provider before streaming starts
      testEngine.applyProvider("anthropic");
      expect(resolveSpy).toHaveBeenCalledWith("anthropic");
      resolveSpy.mockClear();
      // Now start streaming and try again — should be a no-op
      testEngine.start();
      testEngine.applyProvider("openai");
      expect(resolveSpy).not.toHaveBeenCalled();
    });
  });
});
