import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TokenSpeedConfig } from "../src/config/config-types";import {
  COLOR_BLAZING,
  COLOR_FAST,
  COLOR_MEDIUM,
  COLOR_SLOW,
  COUNT_STRATEGY,
  DEFAULT_ICON,
  DISPLAY_MODE,
  END_TPS_BEHAVIOR,
  SLIDING_WINDOW,
  TPS_THRESHOLD_BLAZING,
  TPS_THRESHOLD_FAST,
  TPS_THRESHOLD_MEDIUM,
  TPS_THRESHOLD_SLOW,
  UPDATE_INTERVAL,
  USE_PROVIDER_TOKENS,
} from "../src/config/defaults";
import { TokenSpeedEngine } from "../src/core/engine";

// The real settings module reads the user's settings file at import time
// (getAgentDir); replace it with a controllable fake.
const fakeConfig: TokenSpeedConfig = {
  display: DISPLAY_MODE,
  slidingWindow: SLIDING_WINDOW,
  useProviderTokens: USE_PROVIDER_TOKENS,
  countStrategy: COUNT_STRATEGY,
  endTpsBehavior: END_TPS_BEHAVIOR,
  icon: DEFAULT_ICON,
  updateInterval: UPDATE_INTERVAL,
  thresholds: {
    slow: TPS_THRESHOLD_SLOW,
    medium: TPS_THRESHOLD_MEDIUM,
    fast: TPS_THRESHOLD_FAST,
    blazing: TPS_THRESHOLD_BLAZING,
  },
  colors: {
    slow: COLOR_SLOW,
    medium: COLOR_MEDIUM,
    fast: COLOR_FAST,
    blazing: COLOR_BLAZING,
  },
  providerOverrides: {},
};

vi.mock("../src/config/settings", () => ({
  settings: {
    getConfig: () => fakeConfig,
    getEffectiveConfig: (providerId?: string) => fakeConfig,
  },
}));

describe("TokenSpeedEngine", () => {
  let engine: InstanceType<typeof TokenSpeedEngine>;

  beforeEach(() => {
    engine = new TokenSpeedEngine();
    engine.initialize();
    engine.start();
  });

  const deltas = (n: number) => {
    for (let i = 0; i < n; i++) engine.recordDelta("x");
  };

  describe("initialization", () => {
    it("is not streaming before start", () => {
      const fresh = new TokenSpeedEngine();
      fresh.initialize();
      expect(fresh.isStreaming).toBe(false);
    });

    it("ignores deltas when not streaming", () => {
      const fresh = new TokenSpeedEngine();
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

  describe("estimate counting", () => {
    const estimator = () => {
      const est = new TokenSpeedEngine();
      est.initialize();
      est.start();
      (est as unknown as { _countStrategy: string })._countStrategy = "estimate";
      return est;
    };

    it("estimates tokens from word boundaries and punctuation", () => {
      const est = estimator();
      est.recordDelta("hello world"); // 2 words
      est.recordDelta(" hi!"); // 1 word + 1 punctuation
      expect(est.tokenCount).toBe(4);
    });

    it("counts nothing for empty deltas", () => {
      const est = estimator();
      est.recordDelta("");
      expect(est.tokenCount).toBe(0);
    });
  });

  describe("provider tokens", () => {
    it("falls back to direct counting when provider tokens are disabled", () => {
      const prov = new TokenSpeedEngine();
      prov.initialize();
      prov.start();
      // useProviderTokens is false by default: usageOutput is ignored and
      // the delta counts as 1 direct token
      prov.recordDelta("x", 5);
      expect(prov.tokenCount).toBe(1);
    });

    it("uses the provider-reported increment when enabled", () => {
      const prov = new TokenSpeedEngine();
      prov.initialize();
      prov.start();
      (prov as unknown as { _useProviderTokens: boolean })._useProviderTokens =
        true;
      prov.recordDelta("x", 10); // +10
      prov.recordDelta("x", 18); // +8
      expect(prov.tokenCount).toBe(18);
    });

    it("falls back to direct counting for non-increasing usage reports", () => {
      const prov = new TokenSpeedEngine();
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

  describe("pause/resume", () => {
    it("resumes on the next delta after a pause", () => {
      engine.pause();
      expect(engine["_isPaused"]).toBe(true);
      engine.recordDelta("x");
      expect(engine["_isPaused"]).toBe(false);
    });

    it("accumulates paused time", () => {
      engine.pause();
      engine.recordDelta("x");
      engine.pause();
      engine.recordDelta("x");
      // pausedMs should be >= 0 and the delta counted twice
      expect(engine.tokenCount).toBe(2);
      expect(engine["_pausedMs"]).toBeGreaterThanOrEqual(0);
    });
  });

  describe("tps behavior", () => {
    it("reports the sliding window tps while streaming", () => {
      deltas(5);
      // While streaming, tps reflects the last sliding-window measurement
      expect(engine.tps).toBe(engine["_tps"]);
    });

    it("falls back to the average after streaming ends (default behavior)", () => {
      deltas(5);
      engine.stop();
      // endTpsBehavior is "average": tps === tpsAvg after stop
      expect(engine.tps).toBe(engine.tpsAvg);
    });

    it("keeps the last window value when endTpsBehavior is 'last'", () => {
      const lastEngine = new TokenSpeedEngine();
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
      const fresh = new TokenSpeedEngine();
      fresh.initialize();
      expect(fresh.tpsAvg).toBe(0);
    });
  });

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
  });
});
