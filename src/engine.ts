import type { CountStrategy, EndTpsBehavior } from "./config-types";
import { settings } from "./settings";
import { SlidingWindow } from "./sliding-window";

const TOKEN_REGEX = /\w+|[^\s\w]/g;

export class TokenSpeedEngine {
  private _isStreaming = false;
  private _isPaused = false;

  private _tokenCount = 0;
  private _startTime = 0;
  private _endTime = 0;

  private _ttftStart = 0;
  private _ttftEnd = 0;

  private _startPause = 0;
  private _pausedMs = 0;

  private _tps = 0;
  private _countedUsageOutput = 0;

  private _slidingWindow!: SlidingWindow;
  private _useProviderTokens!: boolean;
  private _countStrategy!: CountStrategy;
  private _endTpsBehavior!: EndTpsBehavior;

  /**
   * Loads configuration.
   * Must be called after `settings.initialize()`.
   */
  initialize(): void {
    const config = settings.getConfig();
    this._slidingWindow = new SlidingWindow(config.slidingWindow);
    this._countStrategy = config.countStrategy;
    this._useProviderTokens = config.useProviderTokens;
    this._endTpsBehavior = config.endTpsBehavior;
  }

  /**
   * Records a streaming delta.
   *
   * Uses provider-reported output-token count when available.
   * Otherwise, falls back to this extension's counter.
   *
   * Counting behavior:
   * - `direct`: Counts 1 token per delta (text, thinking, toolcall)
   * - `estimate`: Approximates tokens from delta text using word-boundary regex
   *
   * @param delta The text/thinking delta string.
   * @param usageOutput Provider-reported cumulative output-token count (optional).
   */
  recordDelta(delta: string, usageOutput?: number): void {
    if (!this._isStreaming) return;
    if (this._isPaused) this.resume();

    const shouldUseProviderTokens =
      this._useProviderTokens &&
      usageOutput !== undefined &&
      usageOutput > this._countedUsageOutput;

    if (shouldUseProviderTokens) {
      this.recordTokens(usageOutput - this._countedUsageOutput);
      this._countedUsageOutput = usageOutput;
      return;
    }

    // Fallback: estimate or direct counting
    if (this._countStrategy === "estimate") {
      this.recordTokens(this.estimateTokens(delta));
    } else {
      this.recordTokens(1);
    }
  }

  /**
   * Snap the total to the authoritative usage so the final average is exact.
   *
   * @param tokens The authoritative token count from the message end event.
   */
  reconcileTotal(tokens: number): void {
    if (tokens > 0) this._tokenCount = tokens;
  }

  /**
   * Whether a streaming session is currently active
   */
  get isStreaming() {
    return this._isStreaming;
  }

  /**
   * Total number of tokens recorded since stream start
   */
  get tokenCount() {
    return this._tokenCount;
  }

  /**
   * Returns elapsed milliseconds since stream start (0 if not started)
   */
  get elapsedMs(): number {
    if (this._startTime === 0) return 0;
    if (this.isStreaming) return Date.now() - this._startTime - this._pausedMs;
    return this._endTime - this._startTime - this._pausedMs;
  }

  /** Returns elapsed seconds since stream start (0 if not started). */
  get elapsedSeconds(): number {
    return this.elapsedMs / 1000;
  }

  /**
   * Returns tokens-per-second based on a time-based sliding window while streaming.
   * When streaming has finished, behavior depends on `endTpsBehavior`:
   * - `"average"` (default): returns the overall average TPS for consistency with stats.
   * - `"last"`: returns the last sliding window measurement.
   */
  get tps(): number {
    if (this._isStreaming) return this._tps;
    if (this._endTpsBehavior === "last") return this._tps;
    return this.tpsAvg;
  }

  /**
   * Returns the overall average tokens-per-second for the entire stream.
   * Computed as total tokens / elapsed seconds. Returns 0 if no time has elapsed.
   */
  get tpsAvg(): number {
    if (this.elapsedSeconds <= 0) return 0;
    return this._tokenCount / this.elapsedSeconds;
  }

  /**
   * Returns time to first token in milliseconds
   */
  get ttft(): number {
    return Math.max(this._ttftEnd - this._ttftStart, 0);
  }

  /**
   * Starts a new streaming session.
   */
  start(): void {
    if (this._isStreaming) return;

    this._tokenCount = 0;
    this._isStreaming = true;
    this._startTime = Date.now();
    this._endTime = Date.now();
    this._slidingWindow.reset();
    this._countedUsageOutput = 0;
    this._tps = 0;
    this._pausedMs = 0;
  }

  /**
   * Records the start timestamp for TTFT measurement.
   */
  startTTFT(): void {
    this._ttftStart = Date.now();
    this._ttftEnd = 0;
  }

  /**
   * Records the end timestamp for TTFT measurement.
   * Only captures once per stream (guarded by _ttftEnd).
   */
  stopTTFT(): void {
    if (this._ttftEnd !== 0) return;
    this._ttftEnd = Date.now();
  }

  /**
   * Stops streaming.
   */
  stop(): void {
    this._isStreaming = false;
    this._endTime = Date.now();
    this._slidingWindow.reset();
  }

  /**
   * Pauses the timer. Call before a non-edit/write tool call ends.
   * The next `recordDelta` will call `resume()`.
   */
  pause(): void {
    this._isPaused = true;
    this._startPause = Date.now();
  }

  /**
   * Resumes the timer, updating the paused time.
   */
  private resume(): void {
    this._isPaused = false;
    this._pausedMs += Date.now() - this._startPause;
  }

  /**
   * Records a batch of tokens, pushing a timestamped event for TPS calculation.
   *
   * @param tokens The number of tokens to record.
   */
  private recordTokens(tokens: number): void {
    if (!this._isStreaming || tokens <= 0) return;

    this._tokenCount += tokens;
    this._slidingWindow.record(tokens);
    this._tps = this._slidingWindow.getTps(Date.now());
  }

  /**
   * Estimates tokens in a text string using a word-boundary regex.
   * Used as a fallback when the provider doesn't report token counts.
   *
   * @param text The text to estimate token count for.
   * @returns The estimated number of tokens.
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    const matches = text.match(TOKEN_REGEX);
    return matches ? matches.length : 0;
  }
}
