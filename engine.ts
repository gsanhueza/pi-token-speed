import { COMPACTION_THRESHOLD } from "./constants";
import { settings } from "./settings";

export class TokenSpeedEngine {
  private _isStreaming = false;
  private _tokenCount = 0;
  private _startTime = 0;
  private _endTime = 0;
  private _ttftStart = 0;
  private _ttftEnd = 0;
  private _events: { time: number; tokens: number }[] = [];
  private _windowStartIndex = 0;
  private _countedUsageOutput = 0;

  private _slidingWindow!: number;
  private _useProviderTokens!: boolean;
  private _countStrategy!: "estimate" | "direct";

  /**
   * Loads configuration from disk. Must be called before any other method.
   */
  async initialize(): Promise<void> {
    const { config } = await settings.getConfig();
    this._slidingWindow = config.slidingWindow;
    this._countStrategy = config.countStrategy;
    this._useProviderTokens = config.useProviderTokens;
  }

  /**
   * Record a streaming delta. Uses provider-reported output-token count
   * when it advances; otherwise falls back to estimating tokens from the
   * delta text.
   *
   * @param delta The text/thinking delta string.
   * @param usageOutput Provider-reported cumulative output-token count (optional).
   */
  recordDelta(delta: string, usageOutput?: number): void {
    if (!this._isStreaming) return;

    if (
      this._useProviderTokens &&
      usageOutput !== undefined &&
      usageOutput > this._countedUsageOutput
    ) {
      this.recordTokens(usageOutput - this._countedUsageOutput);
      this._countedUsageOutput = usageOutput;
    } else {
      if (this._countStrategy === "estimate") {
        this.recordTokens(this.estimateTokens(delta));
      } else {
        this.recordTokens(1);
      }
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
    if (this.isStreaming) return Date.now() - this._startTime;
    return this._endTime - this._startTime;
  }

  /**
   * Returns elapsed seconds since stream start (0 if not started)
   */
  get elapsedSeconds(): number {
    return this.elapsedMs / 1000;
  }

  /**
   * Returns tokens-per-second based on a time-based sliding window.
   * Falls back to the overall average during the first window period.
   */
  get tps(): number {
    // While the window is still filling, use the average instead
    if (this.elapsedMs < this._slidingWindow) return this.tps_avg;

    // While we're stopped, return our last calculation
    if (!this.isStreaming) return this.tps_avg;

    const now = Date.now();
    const windowStart = now - this._slidingWindow;

    // Advance the window start index past events older than the window
    while (
      this._windowStartIndex < this._events.length &&
      this._events[this._windowStartIndex].time < windowStart
    ) {
      this._windowStartIndex++;
    }

    if (this._windowStartIndex >= this._events.length) return this.tps_avg;

    // Sum the tokens (not the events) that fall inside the window
    let windowTokenCount = 0;
    for (let i = this._windowStartIndex; i < this._events.length; i++) {
      windowTokenCount += this._events[i].tokens;
    }
    if (windowTokenCount === 0) return this.tps_avg;

    // Use the actual time span of tokens in the window for finer precision
    const windowDuration =
      (now - this._events[this._windowStartIndex].time) / 1000;
    if (windowDuration === 0) return 0;

    return windowTokenCount / windowDuration;
  }

  /**
   * Returns average tokens-per-second
   */
  private get tps_avg(): number {
    if (this.elapsedSeconds === 0) return 0;
    return this.tokenCount / this.elapsedSeconds;
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
  start() {
    this._tokenCount = 0;
    this._isStreaming = true;
    this._startTime = Date.now();
    this._endTime = Date.now();
    this._events = [];
    this._windowStartIndex = 0;
    this._countedUsageOutput = 0;
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

    // Record the timestamp
    this._ttftEnd = Date.now();

    // Reconcile the start time of the engine, because
    // this is the moment the first token is being processed
    this._startTime = Date.now();
  }

  /**
   * Stops streaming
   */
  stop() {
    this._isStreaming = false;
    this._endTime = Date.now();
    // Release memory — discard accumulated events
    this._events = [];
    this._windowStartIndex = 0;
  }

  /**
   * Records a batch of tokens. Each call pushes a timestamped event for
   * the sliding-window TPS calculation.
   *
   * @param tokens The number of tokens to record.
   */
  recordTokens(tokens: number) {
    if (!this._isStreaming || tokens <= 0) return;

    this._tokenCount += tokens;
    this._events.push({ time: Date.now(), tokens });

    // Compact periodically to prevent unbounded growth during long streams
    if (this._windowStartIndex >= COMPACTION_THRESHOLD) {
      this._compact();
    }
  }

  /**
   * Removes the dead prefix of the events array to free memory.
   */
  private _compact() {
    if (this._windowStartIndex === 0) return;
    this._events = this._events.slice(this._windowStartIndex);
    this._windowStartIndex = 0;
  }

  /**
   * Estimates tokens in a text string.
   * Used as a fallback when the provider doesn't report token counts.
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    const matches = text.match(/\w+|[^\s\w]/g);
    return matches ? matches.length : 0;
  }
}
